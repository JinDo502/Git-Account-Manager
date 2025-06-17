#!/usr/bin/env node

import { Command } from 'commander';
import { switchAccount } from './commands/switchAccount';
import { migrateRepo } from './commands/migrateRepo';
import { initRepo } from './commands/initRepo';
import { initConfig } from './utils/config';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

// 获取包信息
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

// 初始化配置
initConfig();

const program = new Command();

program.name('gh-manager').description('管理多个GitHub账号和仓库的CLI工具').version(packageJson.version);

// 切换账号命令
program.command('switch').description('将当前仓库切换到指定的GitHub账号').argument('[account]', '要切换到的账号名称').action(switchAccount);

// 迁移仓库命令
program
  .command('migrate')
  .description('将仓库从一个GitHub账号迁移到另一个')
  .argument('[sourceAccount]', '源GitHub账号')
  .argument('[targetAccount]', '目标GitHub账号')
  .option('-d, --delete-source', '迁移后删除源仓库', false)
  .action(migrateRepo);

// 初始化仓库命令
program.command('init').description('初始化Git仓库并配置GitHub远程仓库').argument('[account]', '要使用的GitHub账号').action(initRepo);

// 解析命令行参数
program.parse(process.argv);

// 如果没有提供任何命令，显示帮助信息
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
