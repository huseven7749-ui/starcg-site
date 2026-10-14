<?php
// /pet/{id}.gif 的假圖：1x1 GIF
header('Content-Type: image/gif');
echo base64_decode('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==') . str_repeat("\0", 64);
