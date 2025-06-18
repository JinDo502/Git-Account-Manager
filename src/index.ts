#!/usr/bin/env node

import { Command } from 'commander';
import { switchAccount } from './commands/switchAccount';
import { initRepo } from './commands/initRepo';
import { accountManager } from './commands/accountManager';
import { initConfig } from './utils/config';
import fs from 'fs-extra';
import path from 'path';

// 获取包信息
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

// 初始化配置
initConfig();

const program = new Command();

program.name('gh-manager').description('管理多个GitHub账号和仓库的CLI工具').version(packageJson.version);

// 切换账号命令
program
  .command('switch')
  .description('将当前仓库切换到指定的GitHub账号，或迁移到另一个账号')
  .argument('[account]', '要切换到的账号名称，或迁移的目标账号')
  .option('-m, --migrate', '迁移仓库到指定账号')
  .option('-d, --delete-source', '迁移后删除源仓库（仅与--migrate选项一起使用）')
  .option('-p, --private', '创建私有仓库')
  .option('-n, --name <n>', '仓库名称 (默认为当前目录名)')
  .action(switchAccount);

// 初始化仓库命令
program
  .command('init')
  .description('初始化一个新的Git仓库并关联到GitHub')
  .argument('[account]', '要使用的GitHub账号名称')
  .option('-p, --private', '创建私有仓库')
  .option('-n, --name <n>', '仓库名称 (默认为当前目录名)')
  .action(initRepo);

// 账号管理命令
program
  .command('account')
  .description('管理GitHub账号，包括创建、配置、删除和设置默认账号')
  .argument('[account]', '账号名称')
  .option('-l, --list', '列出所有账号')
  .option('-c, --create', '创建新账号')
  .option('-d, --delete', '删除账号')
  .option('-s, --set-default', '设置默认账号')
  .option('--config', '配置现有账号信息')
  .action(accountManager);

program.parse(process.argv);

// 如果没有提供任何命令，显示帮助信息
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
