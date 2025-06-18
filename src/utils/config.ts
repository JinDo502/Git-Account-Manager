import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Config, GitHubAccount } from '../types';
import chalk from 'chalk';

// 配置文件路径
const CONFIG_FILE_PATH = path.join(os.homedir(), '.github_account_manager_ts.json');

// 默认配置模板
const DEFAULT_CONFIG: Config = {
  accounts: {
    personal: {
      githubUsername: 'YourPersonalGHUsername',
      gitUsername: 'Your Personal Name',
      gitEmail: 'your.personal.email@example.com',
      sshHostAlias: 'github.com-personal',
      githubToken: 'your-personal-github-token',
    },
    work: {
      githubUsername: 'YourWorkGHUsername',
      gitUsername: 'Your Work Name',
      gitEmail: 'your.work.email@example.com',
      sshHostAlias: 'github.com-work',
      githubToken: 'your-work-github-token',
    },
  },
  defaultAccount: 'work',
};

/**
 * 初始化配置文件
 * 如果配置文件不存在，则创建默认配置文件
 */
export function initConfig(): void {
  try {
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      fs.writeJsonSync(CONFIG_FILE_PATH, DEFAULT_CONFIG, { spaces: 2 });
      console.log(
        chalk.yellow(`
配置文件已创建: ${CONFIG_FILE_PATH}
请编辑此文件，填入你的GitHub账号信息。
      `)
      );
    }
  } catch (error) {
    console.error(chalk.red('创建配置文件时出错:'), error);
    process.exit(1);
  }
}

/**
 * 读取配置文件
 * @returns 配置对象
 */
export function readConfig(): Config {
  try {
    return fs.readJsonSync(CONFIG_FILE_PATH);
  } catch (error) {
    console.error(chalk.red('读取配置文件时出错:'), error);
    process.exit(1);
  }
}

/**
 * 更新账号信息
 * @param accountName 账号名称
 * @param accountData 账号数据
 */
export function updateAccount(accountName: string, accountData: Partial<GitHubAccount>): void {
  try {
    const config = readConfig();

    if (!config.accounts[accountName]) {
      console.error(chalk.red(`账号 "${accountName}" 不存在。请检查配置文件: ${CONFIG_FILE_PATH}`));
      process.exit(1);
    }

    // 更新账号信息
    config.accounts[accountName] = {
      ...config.accounts[accountName],
      ...accountData,
    };

    // 写入配置文件
    fs.writeJsonSync(CONFIG_FILE_PATH, config, { spaces: 2 });
    console.log(chalk.green(`账号 "${accountName}" 信息已更新`));
  } catch (error) {
    console.error(chalk.red('更新账号信息时出错:'), error);
    process.exit(1);
  }
}

/**
 * 获取账号信息
 * @param accountName 账号名称
 * @returns 账号信息
 */
export function getAccount(accountName?: string): { name: string; account: GitHubAccount } {
  const config = readConfig();

  // 如果没有指定账号，使用默认账号
  const name = accountName || config.defaultAccount;

  if (!config.accounts[name]) {
    console.error(chalk.red(`账号 "${name}" 不存在。请检查配置文件: ${CONFIG_FILE_PATH}`));
    process.exit(1);
  }

  return { name, account: config.accounts[name] };
}

/**
 * 获取所有账号名称
 * @returns 账号名称数组
 */
export function getAccountNames(): string[] {
  const config = readConfig();
  return Object.keys(config.accounts);
}
