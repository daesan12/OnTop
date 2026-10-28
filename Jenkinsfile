pipeline {
    agent any
    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 60, unit: 'MINUTES')
    }
    environment {
        IMAGE_REPOSITORY = 'wooaw/ontop-backend'
    }
    stages {
        stage('Checkout') {
            steps {
                script {
                    // A Pipeline-from-SCM job may not populate env.GIT_BRANCH.
                    // The checkout step returns its Git metadata directly.
                    def checkoutVars = checkout scm
                    env.SOURCE_SHA = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
                    def branch = (checkoutVars?.GIT_LOCAL_BRANCH ?:
                        checkoutVars?.GIT_BRANCH ?:
                        env.BRANCH_NAME ?:
                        env.GIT_LOCAL_BRANCH ?:
                        env.GIT_BRANCH ?: '').toString().trim()
                    branch = branch.replaceFirst(/^refs\/remotes\//, '')
                        .replaceFirst(/^origin\//, '')
                        .replaceFirst(/^refs\/heads\//, '')
                    if (!branch) {
                        // The job is pinned to */dev; a detached HEAD can be
                        // identified by the fetched remote ref as a last resort.
                        def devSha = sh(script: 'git rev-parse refs/remotes/origin/dev', returnStdout: true).trim()
                        if (devSha == env.SOURCE_SHA) {
                            branch = 'dev'
                        }
                    }
                    env.SOURCE_BRANCH = branch
                    if (env.SOURCE_BRANCH != 'dev' || !(env.SOURCE_SHA ==~ /[0-9a-f]{40}/)) {
                        error('ontop-dev requires the dev branch and a full commit SHA.')
                    }
                    echo "Checked out ${env.SOURCE_BRANCH}@${env.SOURCE_SHA}"
                }
            }
        }

        stage('Classify changes') {
            steps {
                script {
                    def result = sh(script: '''#!/usr/bin/env bash
set -euo pipefail
state=/var/lib/jenkins/ontop-state
read_state() {
  [[ -s "$state/$1" ]] && cat "$state/$1" || true
}
tested_base=$(read_state tested.sha)
[[ -n "$tested_base" ]] || tested_base=$(read_state dev.sha)
reviewed_base=$(read_state reviewed-config.sha)
backend_image=$(docker inspect --format '{{.Config.Image}}' ontop-dev-app-app-1 2>/dev/null || true)
python3 infra/ci/plan_changes.py --head "$SOURCE_SHA" --tested-base "$tested_base" --backend-base "$(read_state backend-deployed.sha)" --frontend-base "$(read_state frontend-deployed.sha)" --reviewed-base "$reviewed_base" --live-backend-image "$backend_image"
''', returnStdout: true).trim()
                    def flags = [:]
                    result.split('\n').each { line ->
                        def separator = line.indexOf('=')
                        if (separator > 0) {
                            flags[line.substring(0, separator)] = line.substring(separator + 1)
                        }
                    }
                    env.TEST_BACKEND = flags['TEST_BACKEND'] ?: ''
                    env.TEST_FRONTEND = flags['TEST_FRONTEND'] ?: ''
                    env.DEPLOY_BACKEND = flags['DEPLOY_BACKEND'] ?: ''
                    env.DEPLOY_FRONTEND = flags['DEPLOY_FRONTEND'] ?: ''
                    env.ALLOW_BACKEND_DEPLOY = flags['ALLOW_BACKEND_DEPLOY'] ?: ''
                    env.ALLOW_FRONTEND_DEPLOY = flags['ALLOW_FRONTEND_DEPLOY'] ?: ''
                    env.BACKEND_SEED_SHA = flags['BACKEND_SEED_SHA'] ?: ''
                    env.MANUAL_REVIEW = flags['MANUAL_REVIEW'] ?: ''
                    env.FULL_CHECK = flags['FULL_CHECK'] ?: ''
                    if (!(env.TEST_BACKEND ==~ /[01]/) ||
                        !(env.TEST_FRONTEND ==~ /[01]/) ||
                        !(env.DEPLOY_BACKEND ==~ /[01]/) ||
                        !(env.DEPLOY_FRONTEND ==~ /[01]/) ||
                        !(env.ALLOW_BACKEND_DEPLOY ==~ /[01]/) ||
                        !(env.ALLOW_FRONTEND_DEPLOY ==~ /[01]/) ||
                        !(env.MANUAL_REVIEW ==~ /[01]/) ||
                        !(env.FULL_CHECK ==~ /[01]/) ||
                        (env.BACKEND_SEED_SHA && !(env.BACKEND_SEED_SHA ==~ /[0-9a-f]{40}/))) {
                        error('Change classification returned missing or invalid flags.')
                    }
                    if (env.BACKEND_SEED_SHA) {
                        sh 'python3 infra/ci/write_state.py --kind backend --sha "$BACKEND_SEED_SHA" --state-dir /var/lib/jenkins/ontop-state'
                    }
                    echo "Change flags: ${result.replace('\n', ', ')}"
                }
            }
        }

        stage('Pipeline and Compose checks') {
            steps {
                sh '''#!/usr/bin/env bash
set -euo pipefail
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s infra/ci -p 'test_*.py'
bash -n infra/ci/deploy-dev.sh infra/ci/install-node.sh infra/ci/configure-dev-ci.sh infra/ci/certbot-deploy-hook.sh
scratch_env=$(mktemp)
trap 'rm -f -- "$scratch_env"' EXIT
# The example points at a root-only real app.env; syntax checking needs no secrets.
APP_ENV_FILE="$scratch_env" docker compose --env-file infra/app/dev.deploy.env.example -f infra/app/compose.dev.yaml config --quiet
'''
            }
        }

        stage('Backend tests') {
            when { expression { env.TEST_BACKEND == '1' } }
            steps {
                dir('backend') {
                    sh './gradlew --no-daemon test'
                }
            }
        }

        stage('Frontend tests and build') {
            when { expression { env.TEST_FRONTEND == '1' } }
            steps {
                dir('frontend') {
                    sh '''#!/usr/bin/env bash
set -euo pipefail
pnpm install --frozen-lockfile
pnpm run test
pnpm run build
'''
                }
            }
        }

        stage('Record tested SHA') {
            steps {
                sh 'python3 infra/ci/write_state.py --kind tested --sha "$SOURCE_SHA" --state-dir /var/lib/jenkins/ontop-state'
            }
        }

        stage('Build and publish backend image') {
            when {
                expression {
                    env.SOURCE_BRANCH == 'dev' && env.ALLOW_BACKEND_DEPLOY == '1'
                }
            }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-ontop-upload',
                    usernameVariable: 'DOCKERHUB_USER',
                    passwordVariable: 'DOCKERHUB_TOKEN'
                )]) {
                    sh '''#!/usr/bin/env bash
set -euo pipefail
set +x
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf -- "$DOCKER_CONFIG"' EXIT
image="$IMAGE_REPOSITORY:sha-$SOURCE_SHA"
printf '%s' "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USER" --password-stdin >/dev/null
docker build --platform linux/amd64 --tag "$image" backend
docker push "$image"
'''
                }
            }
        }

        stage('Deploy backend to dev') {
            when {
                expression {
                    env.SOURCE_BRANCH == 'dev' && env.ALLOW_BACKEND_DEPLOY == '1'
                }
            }
            steps {
                sh 'sudo -n /usr/local/sbin/ontop-deploy-dev "$SOURCE_SHA"'
                sh 'python3 infra/ci/write_state.py --kind backend --sha "$SOURCE_SHA" --state-dir /var/lib/jenkins/ontop-state'
            }
        }

        stage('Deploy frontend to dev Vercel project') {
            when {
                expression {
                    env.SOURCE_BRANCH == 'dev' && env.ALLOW_FRONTEND_DEPLOY == '1'
                }
            }
            steps {
                withCredentials([string(credentialsId: 'vercel-ontop-token', variable: 'VERCEL_TOKEN')]) {
                    sh '''#!/usr/bin/env bash
set -euo pipefail
set +x
source /var/lib/jenkins/ontop-config/vercel-dev.env
export VERCEL_ORG_ID VERCEL_PROJECT_ID
[[ "$VERCEL_PROJECT_ID" == prj_q9105AHzFQmB1Bu2FkjmDfsrkKi9 ]] || {
  echo 'The configured Vercel project is not ontop-frontend-dev.' >&2
  exit 1
}
cd frontend
# This is the production target of the separate ontop-frontend-dev project.
vercel deploy --prod --yes --project "$VERCEL_PROJECT_ID" --token "$VERCEL_TOKEN" > vercel-deployment-url.txt
cat vercel-deployment-url.txt
'''
                }
                sh 'python3 infra/ci/write_state.py --kind frontend --sha "$SOURCE_SHA" --state-dir /var/lib/jenkins/ontop-state'
            }
        }

        stage('Manual review gate') {
            when { expression { env.MANUAL_REVIEW == '1' } }
            steps {
                script {
                    echo 'Some deployment targets need configuration review or a verified baseline. Check change flags for each target.'
                    currentBuild.result = 'UNSTABLE'
                }
            }
        }

        stage('Initial baseline') {
            when { expression { env.FULL_CHECK == '1' } }
            steps {
                echo 'No valid tested SHA was found. Full tests ran; deployment requires baseline review.'
            }
        }
    }
    post {
        always {
            archiveArtifacts artifacts: 'frontend/vercel-deployment-url.txt', allowEmptyArchive: true
        }
    }
}
