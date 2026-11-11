#!/usr/bin/env bash
# Run in Git Bash from the repository root or backend directory:
# bash backend/scripts/test-person4-remaining.sh (root)
# bash scripts/test-person4-remaining.sh         (backend)
set -euo pipefail
cd "$(dirname "$0")/.."

echo '== TypeScript typecheck =='
npm run typecheck
echo '== Lint =='
npm run lint
echo '== Production build =='
npm run build
echo '== Existing unit regression suite =='
npm test
echo '== New HTL-06/08/22/23/24 unit tests =='
node --require ts-node/register --test \
  src/modules/hotel-bookings/hotel-reviews.logic.test.ts \
  src/modules/hotel-bookings/hotel-room-status.logic.test.ts \
  src/modules/hotel-bookings/hotel-staff-bookings.test.ts \
  src/modules/hotel-bookings/hotel-completion-routes.test.ts

echo '== Existing hotel booking integration =='
node --require ts-node/register --test test/hotel-bookings.e2e.ts

echo '== New Person 4 isolated-MongoDB integration =='
node --require ts-node/register --test test/hotel-person4-remaining.e2e.ts

echo 'All listed checks completed.'
