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
base=''
if [[ "$SOURCE_BRANCH" == dev ]]; then
  if [[ -f /var/lib/jenkins/ontop-state/dev.sha ]]; then
    base=$(cat /var/lib/jenkins/ontop-state/dev.sha)
  fi
else
  if git show-ref --verify --quiet refs/remotes/origin/dev; then
    base=$(git merge-base origin/dev HEAD || true)
  fi
fi
python3 infra/ci/classify_changes.py --base "$base" --head "$SOURCE_SHA"
''', returnStdout: true).trim()
                    // Jenkins' Groovy sandbox rejects dynamic env[key] writes.
                    // Assign only the four flags used by this pipeline.
                    env.BACKEND_CHANGED = ''
                    env.FRONTEND_CHANGED = ''
                    env.MANUAL_REVIEW = ''
                    env.FULL_CHECK = ''
                    result.split('\n').each { line ->
                        if (line.startsWith('BACKEND_CHANGED=')) {
                            env.BACKEND_CHANGED = line.substring('BACKEND_CHANGED='.length())
                        } else if (line.startsWith('FRONTEND_CHANGED=')) {
                            env.FRONTEND_CHANGED = line.substring('FRONTEND_CHANGED='.length())
                        } else if (line.startsWith('MANUAL_REVIEW=')) {
                            env.MANUAL_REVIEW = line.substring('MANUAL_REVIEW='.length())
                        } else if (line.startsWith('FULL_CHECK=')) {
                            env.FULL_CHECK = line.substring('FULL_CHECK='.length())
                        }
                    }
                    if (!(env.BACKEND_CHANGED ==~ /[01]/) ||
                        !(env.FRONTEND_CHANGED ==~ /[01]/) ||
                        !(env.MANUAL_REVIEW ==~ /[01]/) ||
                        !(env.FULL_CHECK ==~ /[01]/)) {
                        error('Change classification returned missing or invalid flags.')
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

        stage('Shared park data check') {
            when { expression { env.BACKEND_CHANGED == '1' || env.FRONTEND_CHANGED == '1' } }
            steps {
                dir('frontend') {
                    sh '''#!/usr/bin/env bash
set -euo pipefail
pnpm install --frozen-lockfile
pnpm run map:check
'''
                }
            }
        }
        stage('Backend tests') {
            when { expression { env.BACKEND_CHANGED == '1' } }
            steps {
                dir('backend') {
                    sh './gradlew --no-daemon test parkMapTest'
                }
            }
        }

        stage('Frontend tests and build') {
            when { expression { env.FRONTEND_CHANGED == '1' } }
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

        stage('Build and publish backend image') {
            when {
                expression {
                    env.SOURCE_BRANCH == 'dev' && env.BACKEND_CHANGED == '1' &&
                    env.MANUAL_REVIEW == '0' && env.FULL_CHECK == '0'
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
docker build --platform linux/amd64 --file backend/Dockerfile --tag "$image" .
docker push "$image"
'''
                }
            }
        }

        stage('Deploy backend to dev') {
            when {
                expression {
                    env.SOURCE_BRANCH == 'dev' && env.BACKEND_CHANGED == '1' &&
                    env.MANUAL_REVIEW == '0' && env.FULL_CHECK == '0'
                }
            }
            steps {
                sh 'sudo -n /usr/local/sbin/ontop-deploy-dev "$SOURCE_SHA"'
            }
        }

        stage('Deploy frontend to dev Vercel project') {
            when {
                expression {
                    env.SOURCE_BRANCH == 'dev' && env.FRONTEND_CHANGED == '1' &&
                    env.MANUAL_REVIEW == '0' && env.FULL_CHECK == '0'
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
            }
        }

        stage('Manual review gate') {
            when { expression { env.MANUAL_REVIEW == '1' } }
            steps {
                script {
                    echo 'Infrastructure or CI configuration changed. Automatic deployment was skipped.'
                    currentBuild.result = 'UNSTABLE'
                }
            }
        }

        stage('Initial baseline') {
            when { expression { env.FULL_CHECK == '1' } }
            steps {
                echo 'First build runs all tests and records a baseline. Existing dev deployments are left in place.'
            }
        }
    }
    post {
        always {
            script {
                if (env.SOURCE_BRANCH == 'dev' &&
                    (currentBuild.currentResult == 'SUCCESS' || currentBuild.currentResult == 'UNSTABLE')) {
                    sh '''#!/usr/bin/env bash
set -euo pipefail
install -d -m 0700 /var/lib/jenkins/ontop-state
printf '%s\n' "$SOURCE_SHA" > /var/lib/jenkins/ontop-state/dev.sha.new
mv -f /var/lib/jenkins/ontop-state/dev.sha.new /var/lib/jenkins/ontop-state/dev.sha
'''
                }
            }
            archiveArtifacts artifacts: 'frontend/vercel-deployment-url.txt', allowEmptyArchive: true
        }
    }
}
