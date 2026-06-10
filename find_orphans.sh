#!/bin/bash

# Get list of functions
functions=$(ls -d supabase/functions/*/ | grep -v "_shared" | xargs -n 1 basename)

for func in $functions; do
  echo "--- FUNCTION: $func ---"
  
  # Search in src/
  rg --vimgrep "'$func'|\"$func\"" src/
  
  # Search in other functions (excluding self)
  # We search in supabase/functions/ but exclude the directory of the function itself
  find supabase/functions/ -maxdepth 2 -not -path "supabase/functions/$func/*" -type f -name "*.ts" -exec grep -Hn "'$func'" {} +
  find supabase/functions/ -maxdepth 2 -not -path "supabase/functions/$func/*" -type f -name "*.ts" -exec grep -Hn "\"$func\"" {} +

  # Search in config.toml
  rg --vimgrep "$func" supabase/config.toml

  # Search in migrations
  rg --vimgrep "$func" supabase/migrations/

  echo ""
done
