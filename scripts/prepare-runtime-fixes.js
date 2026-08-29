'use strict';

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.js');
const normalized = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');
fs.writeFileSync(indexPath, normalized, 'utf8');

require('./apply-runtime-fixes');
require('./apply-manual-2of2-fix');
