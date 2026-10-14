#!/bin/sh
# 本機測試：重建 dist 並接上假官方 API
cd "$(dirname "$0")/.." || exit 1
node build.mjs >/dev/null || exit 1
cat > dist/api/config.local.php <<'PHP'
<?php
$SC_CONFIG['upstream_market'] = 'http://127.0.0.1:8091/market.php';
$SC_CONFIG['upstream_history'] = 'http://127.0.0.1:8091/marketrecord.php';
$SC_CONFIG['upstream_pet_img'] = 'http://127.0.0.1:8091/pet.php?id=%s';
$SC_CONFIG['upstream_pets'] = 'http://127.0.0.1:8091/pets.json';
$SC_CONFIG['rate_limit_per_min'] = 1000;
PHP
echo rebuilt
