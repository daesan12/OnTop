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
    parameters {
        choice(name: 'PARK_RELEASE_MODE', choices: ['legacy', 'renewal-candidate', 'renewal-deploy'],
            description: 'Default: changed-service tests and automatic deployment. Use renewal modes only for a coordinated map transition.')
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
                    def mode = (params.PARK_RELEASE_MODE ?: 'legacy').toString()
                    if (!(mode in ['legacy', 'renewal-candidate', 'renewal-deploy'])) {
                        error('Unknown park release mode.')
                    }
                    env.PARK_RENEWAL = mode == 'legacy' ? '0' : '1'
                    env.PARK_RENEWAL_APPROVED = '0'
                    env.PARK_RENEWAL_ACTIVE = sh(script: '''#!/usr/bin/env bash
set -euo pipefail
profiles=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' ontop-dev-app-app-1 2>/dev/null | sed -n 's/^SPRING_PROFILES_ACTIVE=//p' || true)
release=$(docker inspect --format '{{index .Config.Labels "ontop.park.release-id"}}' ontop-dev-app-app-1 2>/dev/null || true)
if [[ ",$profiles," == *,park-renewal,* && $release =~ ^[0-9a-f]{64}$ ]]; then printf 1; else printf 0; fi
''', returnStdout: true).trim()
                    if (env.PARK_RENEWAL_ACTIVE == '1') {
                        env.ACTIVE_PARK_RELEASE_ID = sh(script: 'docker inspect --format \'{{index .Config.Labels "ontop.park.release-id"}}\' ontop-dev-app-app-1', returnStdout: true).trim()
                    }
                    if (env.PARK_RENEWAL == '1') {
                        // Every renewal release pairs FE/BE from this same source commit.
                        env.TEST_BACKEND = '1'
                        env.TEST_FRONTEND = '1'
                        env.TEST_PARK_MAP = '0'
                        env.ALLOW_BACKEND_DEPLOY = '0'
                        env.ALLOW_FRONTEND_DEPLOY = '0'
                        env.DEPLOY_BLOCKED = '0'
                        env.FULL_CHECK = '0'
                    }
                }
            }
        }

        stage('Classify changes') {
            when { expression { env.PARK_RENEWAL != '1' } }
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
backend_image=$(docker inspect --format '{{.Config.Image}}' ontop-dev-app-app-1 2>/dev/null || true)
python3 infra/ci/plan_changes.py --head "$SOURCE_SHA" --tested-base "$tested_base" --backend-base "$(read_state backend-deployed.sha)" --frontend-base "$(read_state frontend-deployed.sha)" --live-backend-image "$backend_image"
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
                    env.TEST_PARK_MAP = flags['TEST_PARK_MAP'] ?: ''
                    env.DEPLOY_BACKEND = flags['DEPLOY_BACKEND'] ?: ''
                    env.DEPLOY_FRONTEND = flags['DEPLOY_FRONTEND'] ?: ''
                    env.ALLOW_BACKEND_DEPLOY = flags['ALLOW_BACKEND_DEPLOY'] ?: ''
                    env.ALLOW_FRONTEND_DEPLOY = flags['ALLOW_FRONTEND_DEPLOY'] ?: ''
                    env.BACKEND_SEED_SHA = flags['BACKEND_SEED_SHA'] ?: ''
                    env.DEPLOY_BLOCKED = flags['DEPLOY_BLOCKED'] ?: ''
                    env.FULL_CHECK = flags['FULL_CHECK'] ?: ''
                    env.RENEWAL_DEPLOY_REQUIRED = flags['RENEWAL_DEPLOY_REQUIRED'] ?: ''
                    if (!(env.TEST_BACKEND ==~ /[01]/) ||
                        !(env.TEST_FRONTEND ==~ /[01]/) ||
                        !(env.TEST_PARK_MAP ==~ /[01]/) ||
                        !(env.DEPLOY_BACKEND ==~ /[01]/) ||
                        !(env.DEPLOY_FRONTEND ==~ /[01]/) ||
                        !(env.ALLOW_BACKEND_DEPLOY ==~ /[01]/) ||
                        !(env.ALLOW_FRONTEND_DEPLOY ==~ /[01]/) ||
                        !(env.DEPLOY_BLOCKED ==~ /[01]/) ||
                        !(env.FULL_CHECK ==~ /[01]/) ||
                        !(env.RENEWAL_DEPLOY_REQUIRED ==~ /[01]/) ||
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

        stage('Prepare shared renewal release') {
            // Backend tests also read these ignored fixtures in legacy mode.
            // Regenerate before Gradle so a reused workspace cannot supply an old map.
            when { expression { env.PARK_RENEWAL == '1' || env.TEST_BACKEND == '1' } }
            steps {
                dir('frontend') { sh 'pnpm install --frozen-lockfile && pnpm run prepare:park-renewal:release' }
                script {
                    env.PARK_RELEASE_ID = sh(script: "python3 -c 'import json; print(json.load(open(\"frontend/generated/park-renewal/release.json\"))[\"releaseId\"])'", returnStdout: true).trim()
                    if (!(env.PARK_RELEASE_ID ==~ /[0-9a-f]{64}/)) { error('Invalid renewal release ID.') }
                }
            }
        }

        stage('Pipeline and Compose checks') {
            steps {
                sh '''#!/usr/bin/env bash
set -euo pipefail
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s infra/ci -p 'test_*.py'
python3 infra/ci/check_park_handoff.py
bash -n infra/ci/deploy-dev.sh infra/ci/deploy-park-renewal.sh infra/ci/renewal-vercel.sh infra/ci/install-node.sh infra/ci/configure-dev-ci.sh infra/ci/certbot-deploy-hook.sh infra/ci/run-generated-map-tests.sh infra/app/stage-generated-map.sh infra/app/stage-park-renewal.sh infra/app/verify-skewer-coop-db.sh
scratch_env=$(mktemp)
trap 'rm -f -- "$scratch_env"' EXIT
# The example points at a root-only real app.env; syntax checking needs no secrets.
APP_ENV_FILE="$scratch_env" docker compose --env-file infra/app/dev.deploy.env.example -f infra/app/compose.dev.yaml config --quiet
APP_ENV_FILE="$scratch_env" PARK_MAP_HOST_DIR="$PWD/frontend/generated/park" docker compose --env-file infra/app/dev.deploy.env.example -f infra/app/compose.dev.yaml -f infra/app/compose.generated-map.yaml config --quiet
APP_ENV_FILE="$scratch_env" SKEWER_COOP_JOURNAL_HOST_DIR="$PWD" docker compose --env-file infra/app/dev.deploy.env.example -f infra/app/compose.dev.yaml -f infra/app/compose.skewer-coop.yaml config --quiet
APP_ENV_FILE="$scratch_env" PARK_MAP_HOST_DIR="$PWD/frontend/generated/park" SKEWER_COOP_JOURNAL_HOST_DIR="$PWD" docker compose --env-file infra/app/dev.deploy.env.example -f infra/app/compose.dev.yaml -f infra/app/compose.generated-map.yaml -f infra/app/compose.skewer-coop.yaml config --quiet
APP_ENV_FILE="$scratch_env" PARK_RENEWAL_HOST_DIR="$PWD/frontend/generated/park-renewal" PARK_RENEWAL_RELEASE_ID="$(printf 'a%.0s' {1..64})" PARK_RENEWAL_SOURCE_SHA="$SOURCE_SHA" SKEWER_COOP_JOURNAL_HOST_DIR="$PWD" docker compose --env-file infra/app/dev.deploy.env.example -f infra/app/compose.dev.yaml -f infra/app/compose.park-renewal.yaml -f infra/app/compose.skewer-coop.yaml config --quiet
'''
            }
        }

        stage('Backend tests') {
            when { expression { env.TEST_BACKEND == '1' } }
            steps {
                sh 'bash infra/ci/run-generated-map-tests.sh full'
                script {
                    if (env.PARK_RENEWAL == '1') {
                        dir('backend') { sh 'bash ./gradlew --no-daemon bootJar' }
                    }
                }
            }
        }

        stage('Generated park handoff and candidate build') {
            when { expression { env.TEST_PARK_MAP == '1' && env.PARK_RENEWAL_ACTIVE != '1' } }
            steps {
                sh '''#!/usr/bin/env bash
set -euo pipefail
if [[ "$TEST_BACKEND" != 1 ]]; then
  bash infra/ci/run-generated-map-tests.sh handoff
fi
'''
                dir('frontend') {
                    sh '''#!/usr/bin/env bash
set -euo pipefail
pnpm install --frozen-lockfile
pnpm map:check
VITE_ALKKAGI_ENABLED=true VITE_WARDROBE_OUTFITS=true VITE_PARK_BINDINGS_URL=/park-bindings.generated.dev.json pnpm run build:park
'''
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
if [[ "${PARK_RENEWAL:-0}" == 1 ]]; then
  pnpm run test
  pnpm run build:park-renewal:release
  cd ..
  jar=$(find backend/build/libs -maxdepth 1 -name '*.jar' ! -name '*-plain.jar' | head -n 1)
  python3 infra/ci/check_park_renewal.py --source-sha "$SOURCE_SHA" --dist frontend/dist-park-renewal --jar "$jar"
elif [[ "${PARK_RENEWAL_ACTIVE:-0}" == 1 ]]; then
  pnpm run test
  pnpm run prepare:park-renewal:release
  if [[ "${RENEWAL_DEPLOY_REQUIRED:-0}" == 1 ]]; then
    pnpm run build:park-renewal:release
  else
    cd ..
    python3 infra/ci/prepare_active_renewal_frontend.py --source-sha "$SOURCE_SHA" --stage
    cd frontend
    pnpm run build:park-renewal:active
  fi
else
pnpm map:check
pnpm run test
pnpm run build
if [[ "$TEST_PARK_MAP" != 1 ]]; then
  VITE_ALKKAGI_ENABLED=true VITE_WARDROBE_OUTFITS=true VITE_PARK_BINDINGS_URL=/park-bindings.generated.dev.json pnpm run build:park
fi
fi
'''
                }
            }
        }

        stage('Record tested SHA') {
            when { expression { env.PARK_RENEWAL != '1' } }
            steps {
                sh 'python3 infra/ci/write_state.py --kind tested --sha "$SOURCE_SHA" --state-dir /var/lib/jenkins/ontop-state'
            }
        }

        stage('Approve coordinated renewal deployment') {
            when { expression { params.PARK_RELEASE_MODE == 'renewal-deploy' } }
            steps {
                sh 'python3 infra/ci/check_park_renewal.py --source-sha "$SOURCE_SHA" --dist frontend/dist-park-renewal --require-clean'
                sh 'sudo -n /usr/local/sbin/ontop-deploy-park-renewal --check "$SOURCE_SHA" "$PARK_RELEASE_ID"'
                script {
                    def confirmed = input(message: "Deploy dev FE+BE ${env.SOURCE_SHA}, park release ${env.PARK_RELEASE_ID}? Confirm actual V167 history/reservation, DB backup and rollback compatibility, admission closed and existing games settled.",
                        ok: 'Approve coordinated dev transition', parameters: [booleanParam(name: 'TRANSITION_READY', defaultValue: false, description: 'Infrastructure preflight and coordinated transition window are ready.')])
                    if (confirmed != true) { error('Coordinated transition was not approved.') }
                    env.PARK_RENEWAL_APPROVED = '1'
                    env.ALLOW_BACKEND_DEPLOY = '1'
                    env.ALLOW_FRONTEND_DEPLOY = '1'
                }
            }
        }

        stage('Prepare verified Vercel prebuilt frontend') {
            when { expression { env.PARK_RENEWAL_APPROVED == '1' } }
            steps {
                withCredentials([string(credentialsId: 'vercel-ontop-token', variable: 'VERCEL_TOKEN')]) {
                    sh '''#!/usr/bin/env bash
set -euo pipefail
set +x
source /var/lib/jenkins/ontop-config/vercel-dev.env
export VERCEL_ORG_ID VERCEL_PROJECT_ID
bash infra/ci/renewal-vercel.sh prepare
'''
                }
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
                script {
                    if (env.PARK_RENEWAL == '1') {
                        sh 'sudo -n /usr/local/sbin/ontop-deploy-park-renewal --apply "$SOURCE_SHA" "$PARK_RELEASE_ID"'
                    } else if (env.PARK_RENEWAL_ACTIVE == '1') {
                        sh 'sudo -n /usr/local/sbin/ontop-deploy-park-renewal --update "$SOURCE_SHA" "$ACTIVE_PARK_RELEASE_ID"'
                    } else {
                        sh 'sudo -n /usr/local/sbin/ontop-deploy-dev "$SOURCE_SHA"'
                    }
                }
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
                script {
                    if (env.PARK_RENEWAL != '1') { sh 'python3 infra/ci/check_live_park.py' }
                }
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
if [[ "${PARK_RENEWAL:-0}" == 1 ]]; then
  bash infra/ci/renewal-vercel.sh deploy
elif [[ "${PARK_RENEWAL_ACTIVE:-0}" == 1 ]]; then
  bash infra/ci/renewal-vercel.sh update
else
cd frontend
# This is the production target of the separate ontop-frontend-dev project.
vercel deploy --prod --yes --local-config vercel.dev.json --project "$VERCEL_PROJECT_ID" --build-env VITE_WARDROBE_OUTFITS=true --build-env VITE_SKEWER_COOP_ENABLED=true --build-env VITE_PARK_BINDINGS_URL=/park-bindings.generated.dev.json --token "$VERCEL_TOKEN" > vercel-deployment-url.txt
cat vercel-deployment-url.txt
fi
'''
                }
                sh 'python3 infra/ci/write_state.py --kind frontend --sha "$SOURCE_SHA" --state-dir /var/lib/jenkins/ontop-state'
            }
        }

        stage('Deployment state gate') {
            when { expression { env.DEPLOY_BLOCKED == '1' } }
            steps {
                script {
                    if (env.RENEWAL_DEPLOY_REQUIRED == '1') {
                        echo 'The active renewal map contract changed. Run renewal-candidate, then use the approved renewal-deploy transition.'
                    } else {
                        echo 'Deployment needs a valid baseline or a matching live backend image. Check change flags for each target.'
                    }
                    currentBuild.result = 'UNSTABLE'
                }
            }
        }

        stage('Initial baseline') {
            when { expression { env.FULL_CHECK == '1' } }
            steps {
                echo 'No valid tested SHA was found. Full tests ran; deployment requires baseline initialization.'
            }
        }
    }
    post {
        always {
            archiveArtifacts artifacts: 'frontend/vercel-deployment-url.txt,frontend/generated/park/manifest.json,docs/integration/park-180/park-bindings.dev.json', allowEmptyArchive: true
        }
        success {
            script {
                if (env.PARK_RENEWAL == '1') {
                    archiveArtifacts artifacts: "frontend/dist-park-renewal/**,frontend/generated/park-renewal/releases/${env.PARK_RELEASE_ID}/**,backend/build/libs/*.jar,frontend/park-renewal-assets.lock.json", fingerprint: true
                }
            }
        }
    }
}
