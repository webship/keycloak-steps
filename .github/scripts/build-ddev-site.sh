#!/usr/bin/env bash
# Builds the site the suite runs against, in a DDEV project: a sign-in server (Keycloak, Apache-2.0) in
# its container in development mode, with the test realm the build imports from site/realm/, and a small
# test app next to it that sends a person to the server to sign in and shows who is signed in:
#
#   - https://<project>.ddev.site/        the test app (site/app/: a page of the pack's own with the
#                                          official JavaScript adapter, keycloak-js, Apache-2.0, from npm);
#   - https://<project>.ddev.site/partner/ the same app as a client that asks for consent;
#   - https://<project>.ddev.site/auth/   the sign-in server, behind the project's own web server, so the
#                                          router of the container tool needs no port of its own for it;
#   - https://<project>.ddev.site:8026    the project's mail catcher (Mailpit), which the server sends
#                                          its mail to.
#
# The server makes a temporary admin of its master realm at its first start; the build makes the
# permanent one (BUILD_ADMIN) and deletes the temporary one, then writes the accounts of the realm with
# site/keycloak-site.sh, run by bash in the server's container with the server's own admin CLI.
#
# Settings (environment variables, all optional):
#   PROJECT_NAME         the DDEV project name                          (default keycloaksteps)
#   SITE_DIR             the project folder                             (default a new temporary folder)
#   KEYCLOAK_VERSION     the server's release (a tag of quay.io/keycloak/keycloak)   (default 26.8.2)
#   LOGIN_THEME          the login theme of the realm: empty for the server's default,
#                        or keycloak.v2, keycloak                       (default empty)
#   ACCOUNT_PASSWORD     the password of the accounts below            (default dD.123123ddd)
#   BUILD_ADMIN          the admin of the master realm, for the build only   (default admin)
#   BUILD_ADMIN_PASSWORD its password                                   (default ACCOUNT_PASSWORD)
#   ACCOUNTS_ONLY        1: build nothing, give the accounts of the realm in SITE_DIR back their email,
#                        names, password, roles and one-time code
#
# The accounts are configuration: this script creates them and cucumber.js names them; the features
# never create or delete one.
#   administrator  administrator@example.com  the realm's admin (realm-management: realm-admin)
#   editor         editor@example.com         the realm role editor
#   user           user@example.com           no role of its own
#   otpuser        otpuser@example.com        a one-time code set up (the secret is OTP_SECRET below)
#
# No hosted service, no account anywhere, nothing that is not open source.
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-keycloaksteps}"
KEYCLOAK_VERSION="${KEYCLOAK_VERSION:-26.8.2}"
LOGIN_THEME="${LOGIN_THEME:-}"
ACCOUNT_PASSWORD="${ACCOUNT_PASSWORD:-dD.123123ddd}"
BUILD_ADMIN="${BUILD_ADMIN:-admin}"
BUILD_ADMIN_PASSWORD="${BUILD_ADMIN_PASSWORD:-$ACCOUNT_PASSWORD}"
SITE_DIR="${SITE_DIR:-$(mktemp -d)}"
PACK_SITE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../site" && pwd)"
REALM="webship"
HOST="${PROJECT_NAME}.ddev.site"
APP_URL="https://${HOST}"
# The secret of otpuser's one-time code, as the server keeps it (20 characters). An authenticator app
# gets it in base32: O5SWE43INFYHIZLTORXXI4DTMVRXEZLU (cucumber.js, users.otpuser.otpSecret).
OTP_SECRET="webshiptestotpsecret"

# The payload of site/keycloak-site.sh: lines of KEY=base64(value), all of it in base64 again.
payload() {
  local line="" key
  for key in "$@"; do
    line="${line}${key}=$(printf '%s' "${!key}" | base64 -w0)"$'\n'
  done
  printf '%s' "$line" | base64 -w0
}

# Run verbs of site/keycloak-site.sh in the server's container, with the payload on its first line.
site_script() {
  local verbs="$1" ; shift
  { printf "SITE_PAYLOAD='%s'\n" "$(payload "$@")"; cat "${PACK_SITE}/keycloak-site.sh"; } \
    | ddev exec -s keycloak "SITE_VERBS='${verbs}' bash -s"
}

# The partial import of the accounts of the realm, with their passwords and otpuser's one-time code.
accounts_json() {
  ACCOUNT_PASSWORD="$ACCOUNT_PASSWORD" OTP_SECRET="$OTP_SECRET" REALM="$REALM" python3 -c '
import json, os
p, realm = os.environ["ACCOUNT_PASSWORD"], os.environ["REALM"]
def account(name, realm_roles=(), client_roles=None, otp=False):
    credentials = [{"type": "password", "value": p, "temporary": False}]
    if otp:
        credentials.append({"type": "otp", "userLabel": "Test phone",
            "secretData": json.dumps({"value": os.environ["OTP_SECRET"]}),
            "credentialData": json.dumps({"subType": "totp", "digits": 6, "counter": 0, "period": 30, "algorithm": "HmacSHA1"})})
    user = {"username": name, "email": name + "@example.com", "firstName": name.capitalize(), "lastName": "Webship",
            "enabled": True, "emailVerified": True, "requiredActions": [], "credentials": credentials,
            "realmRoles": ["default-roles-" + realm] + list(realm_roles)}
    if client_roles:
        user["clientRoles"] = client_roles
    return user
users = [
    account("administrator", client_roles={"realm-management": ["realm-admin"]}),
    account("editor", realm_roles=["editor"]),
    account("user"),
    account("otpuser", otp=True),
]
print(json.dumps({"ifResourceExists": "OVERWRITE", "users": users}))'
}

# The partial import of the permanent admin of the master realm.
owner_json() {
  BUILD_ADMIN="$BUILD_ADMIN" BUILD_ADMIN_PASSWORD="$BUILD_ADMIN_PASSWORD" python3 -c '
import json, os
print(json.dumps({"ifResourceExists": "OVERWRITE", "users": [{
    "username": os.environ["BUILD_ADMIN"], "email": os.environ["BUILD_ADMIN"] + "@example.com",
    "firstName": "Build", "lastName": "Admin", "enabled": True, "emailVerified": True,
    "credentials": [{"type": "password", "value": os.environ["BUILD_ADMIN_PASSWORD"], "temporary": False}],
    "realmRoles": ["admin", "default-roles-master"]}]}))'
}

# Wait until the server says it is ready (its health endpoint, on its management port).
wait_for_server() {
  local attempt
  for attempt in $(seq 1 120); do
    if ddev exec "curl -fsS http://keycloak:9000/auth/health/ready" < /dev/null > /dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "The sign-in server did not get ready; the end of its log:" >&2
  ddev logs -s keycloak --tail 80 < /dev/null >&2 || true
  return 1
}

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"

if [ "${ACCOUNTS_ONLY:-}" = "1" ]; then
  ADMIN_USER="$BUILD_ADMIN" ADMIN_PASSWORD="$BUILD_ADMIN_PASSWORD" ACCOUNTS="$(accounts_json)" site_script accounts ADMIN_USER ADMIN_PASSWORD REALM ACCOUNTS
  exit 0
fi

# A project of this name from an earlier build goes first, with its containers and volumes.
if ddev describe "$PROJECT_NAME" > /dev/null 2>&1; then
  ddev delete -Oy "$PROJECT_NAME" < /dev/null
fi

# A generic project whose web server serves the test app from app/ and the sign-in server under /auth/:
# no database of the container tool's own (the server keeps its data in its own file database, in a
# volume of the project), Node.js 24 for the app's packages and for a test suite run in the web container.
ddev config --project-type=generic --webserver-type=nginx-fpm --docroot=app --project-name="$PROJECT_NAME" \
  --omit-containers=db --nodejs-version=24 < /dev/null

# The test app and the realm the server imports at its first start.
rm -rf app keycloak
mkdir -p app keycloak/import
cp -R "${PACK_SITE}/app/." app/
cp "${PACK_SITE}/realm/webship-realm.json" keycloak/import/
printf '{\n  "url": "%s/auth",\n  "realm": "%s"\n}\n' "$APP_URL" "$REALM" > app/config.json

# The server's admin at its first start: a temporary one with a password of this build only. The build
# replaces it with BUILD_ADMIN, and takes it out of the project's files once the server has started.
TEMP_ADMIN="first-start-admin"
TEMP_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"

write_compose() {
  local bootstrap="$1"
  cat > .ddev/docker-compose.keycloak.yaml <<YAMLEOF
## The sign-in server of this project (Keycloak ${KEYCLOAK_VERSION}, development mode), as a service. The
## project's web server sends /auth/ to it (.ddev/nginx/keycloak.conf). It imports the realm files of
## keycloak/import/ at its first start, and keeps its data in a volume of the project. Written by the
## build script; build again rather than editing by hand.
services:
  keycloak:
    container_name: ddev-\${DDEV_SITENAME}-keycloak
    image: quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}
    command: ["start-dev", "--import-realm"]
    restart: "no"
    labels:
      com.ddev.site-name: \${DDEV_SITENAME}
      com.ddev.approot: \${DDEV_APPROOT}
    environment:
      - KC_HTTP_RELATIVE_PATH=/auth
      - KC_HOSTNAME=${APP_URL}/auth
      - KC_PROXY_HEADERS=xforwarded
      - KC_HTTP_ENABLED=true
      - KC_HEALTH_ENABLED=true
      - JAVA_OPTS_KC_HEAP=-Xms128m -Xmx768m
      - APP_URL=${APP_URL}
      - SMTP_HOST=web
      - SMTP_PORT=1025
${bootstrap}    expose:
      - "8080"
      - "9000"
    volumes:
      - \${DDEV_APPROOT}/keycloak/import:/opt/keycloak/data/import:ro
      - keycloak-data:/opt/keycloak/data
volumes:
  keycloak-data:
    name: ddev-\${DDEV_SITENAME}-keycloak-data
YAMLEOF
}
write_compose "      - KC_BOOTSTRAP_ADMIN_USERNAME=${TEMP_ADMIN}
      - KC_BOOTSTRAP_ADMIN_PASSWORD=${TEMP_PASSWORD}
"
mkdir -p .ddev/nginx
cat > .ddev/nginx/keycloak.conf <<'NGINXEOF'
# The sign-in server under /auth/ of the site (the keycloak service); everything else is the test app of
# the docroot. ^~ keeps the static-file rules of the web server off the server's own files.
location ^~ /auth/ {
    proxy_pass http://keycloak:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    proxy_set_header X-Forwarded-Port $http_x_forwarded_port;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
}
NGINXEOF
if [ -n "$LOGIN_THEME" ]; then
  python3 - keycloak/import/webship-realm.json "$LOGIN_THEME" <<'PYEOF'
import json, sys
path, theme = sys.argv[1:3]
realm = json.load(open(path))
realm["loginTheme"] = theme
json.dump(realm, open(path, "w"), indent=2)
PYEOF
fi

ddev start -y < /dev/null
echo "Installing the test app's packages (keycloak-js)."
ddev exec "cd /var/www/html/app && npm install --no-audit --no-fund --loglevel=error" < /dev/null
echo "Waiting for the sign-in server (Keycloak ${KEYCLOAK_VERSION})."
wait_for_server

# The permanent admin of the master realm, then the accounts of the test realm.
ADMIN_USER="$TEMP_ADMIN" ADMIN_PASSWORD="$TEMP_PASSWORD" OWNER_USER="$BUILD_ADMIN" OWNER_PASSWORD="$BUILD_ADMIN_PASSWORD" OWNER="$(owner_json)" \
  ACCOUNTS="$(accounts_json)" site_script "owner accounts" ADMIN_USER ADMIN_PASSWORD OWNER_USER OWNER_PASSWORD OWNER REALM ACCOUNTS
# The temporary admin is gone: its password leaves the project's files (the running server keeps it in
# its environment until it is restarted; it opens nothing any more).
write_compose ""

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LAUNCH_URL=$APP_URL" >> "$GITHUB_ENV"
fi
VERSION="$(ddev exec -s keycloak "cat /opt/keycloak/version.txt" < /dev/null | tr -d '\r' | head -n 1)"
echo "Built ${VERSION} at ${APP_URL}/auth (realm ${REALM}), the test app at ${APP_URL}/, its mail at https://${HOST}:8026"
