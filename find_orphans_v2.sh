#!/bin/bash

# Get all function names
functions=$(ls -d supabase/functions/*/ | grep -v "_shared" | xargs -n 1 basename)

for func in $functions; do
  echo "--- $func ---"
  # Search everywhere except the function's own directory and .git and node_modules
  # We use -g to exclude the function's own directory
  rg -w "$func" . -g "!supabase/functions/$func/**" -g "!audit_results.txt" -g "!full_audit.txt" -g "!find_orphans*"
  echo ""
done
