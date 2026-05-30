import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const packagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');

export const CLI_VERSION: string = require(packagePath).version as string;
