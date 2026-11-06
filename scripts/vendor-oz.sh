#!/usr/bin/env bash
# Vendor OpenZeppelin into packages/contracts/lib for the step03 foundry profile.
# Needed on filesystems where ../../node_modules resolves to a case-mismatched path
# (e.g. OneDrive on Windows), which Foundry's allow_paths validator rejects.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p packages/contracts/lib
rm -rf packages/contracts/lib/@openzeppelin
cp -r node_modules/@openzeppelin packages/contracts/lib/
echo "Vendored OZ into packages/contracts/lib/@openzeppelin"
