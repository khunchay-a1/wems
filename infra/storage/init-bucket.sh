#!/usr/bin/env bash
# Idempotent bucket setup for the local S3-compatible storage (docs/06-security.md: bucket rules).
# Runs inside amazon/aws-cli; safe to re-run on every `docker compose up`.
set -euo pipefail

rm -f /tmp/ready
mkdir -p "$HOME/.aws"
cat > "$HOME/.aws/config" <<CFG
[default]
region = ${AWS_DEFAULT_REGION}
s3 =
  addressing_style = path
CFG
# Newer AWS CLI sends extra checksum headers that some S3-compatible servers reject
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

s3api() { aws --endpoint-url "$S3_ENDPOINT" s3api "$@"; }

# shellcheck disable=SC2086 # word splitting of the space-separated list is intended
origins_json=$(printf '"%s",' $CORS_ORIGINS)
origins_json="[${origins_json%,}]"

for bucket in $S3_BUCKETS; do
  if s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    echo "bucket $bucket: exists"
  else
    s3api create-bucket --bucket "$bucket" >/dev/null
    echo "bucket $bucket: created"
  fi

  # Required: versioning on (02-architecture.md §2, 06-security.md)
  s3api put-bucket-versioning --bucket "$bucket" --versioning-configuration Status=Enabled
  echo "bucket $bucket: versioning enabled"

  # Best effort: lifecycle + CORS (warn instead of failing if the server lacks support)
  if s3api put-bucket-lifecycle-configuration --bucket "$bucket" --lifecycle-configuration '{
      "Rules": [{
        "ID": "expire-noncurrent-90d",
        "Status": "Enabled",
        "Filter": {"Prefix": ""},
        "NoncurrentVersionExpiration": {"NoncurrentDays": 90}
      }]}' >/dev/null 2>&1; then
    echo "bucket $bucket: lifecycle set (noncurrent versions expire after 90 days)"
  else
    echo "WARN bucket $bucket: lifecycle not supported by this server" >&2
  fi

  if s3api put-bucket-cors --bucket "$bucket" --cors-configuration "{
      \"CORSRules\": [{
        \"AllowedOrigins\": ${origins_json},
        \"AllowedMethods\": [\"GET\", \"PUT\", \"HEAD\"],
        \"AllowedHeaders\": [\"*\"],
        \"ExposeHeaders\": [\"ETag\"],
        \"MaxAgeSeconds\": 3600
      }]}" >/dev/null 2>&1; then
    echo "bucket $bucket: CORS set for ${CORS_ORIGINS}"
  else
    echo "WARN bucket $bucket: CORS not supported by this server" >&2
  fi
done

touch /tmp/ready
echo "storage ready"
# Stay alive so the healthcheck reports healthy (lets `docker compose up --wait` succeed)
exec sleep infinity
