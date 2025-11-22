#!/bin/bash
set -e

# Build MAYO WASM module with proper exports
cd "$(dirname "$0")"

MAYO_SRC="mayo-c-source/src"
OUTPUT_DIR="mayo-c-source"
OUTPUT_JS="$OUTPUT_DIR/mayo.js"
OUTPUT_WASM="$OUTPUT_DIR/mayo.wasm"

echo "Building MAYO WASM module..."

# Compile with Emscripten
emcc \
  -O3 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createModule" \
  -s EXPORTED_FUNCTIONS='["_malloc","_free","_randombytes","_pqmayo_MAYO_1_opt_crypto_sign_keypair","_pqmayo_MAYO_1_opt_crypto_sign_signature","_pqmayo_MAYO_1_opt_crypto_sign_verify","_pqmayo_MAYO_1_opt_crypto_sign","_pqmayo_MAYO_1_opt_crypto_sign_open"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAP8","HEAPU8","HEAP16","HEAPU16","HEAP32","HEAPU32","HEAPF32","HEAPF64","ccall","cwrap","UTF8ToString","stringToUTF8"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=33554432 \
  -s MAXIMUM_MEMORY=134217728 \
  -s STACK_SIZE=16777216 \
  -s ASSERTIONS=0 \
  -s SAFE_HEAP=0 \
  -s TOTAL_STACK=16777216 \
  -I"$MAYO_SRC" \
  -I"$MAYO_SRC/mayo_1" \
  -I"$MAYO_SRC/common" \
  -I"$MAYO_SRC/generic" \
  -I"mayo-c-source/include" \
  -DMAYO_VARIANT=MAYO_1 \
  -DMAYO_BUILD_TYPE_OPT=1 \
  -DHAVE_RANDOMBYTES_NORETVAL=1 \
  -DHAVE_STACKEFFICIENT=1 \
  "$MAYO_SRC/mayo.c" \
  "$MAYO_SRC/params.c" \
  "$MAYO_SRC/arithmetic.c" \
  "$MAYO_SRC/mayo_1/api.c" \
  "$MAYO_SRC/common/fips202.c" \
  "$MAYO_SRC/common/mem.c" \
  "$MAYO_SRC/common/randombytes_system.c" \
  "$MAYO_SRC/common/aes128ctr.c" \
  "$MAYO_SRC/common/aes_c.c" \
  -I"$MAYO_SRC/generic" \
  -o "$OUTPUT_JS"

# Rename to .cjs for CommonJS compatibility
if [ -f "$OUTPUT_JS" ]; then
  mv "$OUTPUT_JS" "$OUTPUT_DIR/mayo.cjs"
  echo "Build complete: $OUTPUT_DIR/mayo.cjs and $OUTPUT_WASM"
else
  echo "Build failed: $OUTPUT_JS not found"
  exit 1
fi

