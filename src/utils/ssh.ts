import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import execa from 'execa';
import { GitHubAccount } from '../types';

// SSH配置文件路径
const SSH_CONFIG_PATH = path.join(os.homedir(), '.ssh', 'config');

/**
 * 读取SSH配置文件
 * @returns SSH配置文件内容
 */
export function readSshConfig(): string {
  try {
    if (!fs.existsSync(SSH_CONFIG_PATH)) {
      console.log(chalk.yellow(`SSH配置文件不存在: ${SSH_CONFIG_PATH}`));
      return '';
    }
    return fs.readFileSync(SSH_CONFIG_PATH, 'utf8');
  } catch (error) {
    console.error(chalk.red('读取SSH配置文件时出错:'), error);
    return '';
  }
}

/**
 * 解析SSH配置文件，提取Host块
 * @param config SSH配置文件内容
 * @returns 解析后的Host块对象，键为Host名称，值为配置内容
 */
export function parseSshConfig(config: string): Record<string, string> {
  const hosts: Record<string, string> = {};

  if (!config) return hosts;

  // 使用正则表达式匹配Host块
  const hostBlocks = config.split(/\n(?=Host\s+)/);

  for (const block of hostBlocks) {
    const hostMatch = block.match(/^Host\s+(.+?)(?:\n|$)/);
    if (hostMatch) {
      const hostName = hostMatch[1].trim();
      hosts[hostName] = block;
    }
  }

  return hosts;
}

/**
 * 检查SSH主机别名是否已存在于配置中
 * @param hostAlias SSH主机别名
 * @returns 是否存在
 */
export function checkSshHostExists(hostAlias: string): boolean {
  const config = readSshConfig();
  const hosts = parseSshConfig(config);
  return !!hosts[hostAlias];
}

/**
 * 获取SSH密钥文件路径
 * @param hostAlias SSH主机别名
 * @returns SSH密钥文件路径
 */
export function getSshKeyPath(hostAlias: string): string {
  const keyName = hostAlias.replace('github.com-', '');
  return path.join(os.homedir(), '.ssh', `id_rsa_${keyName}`);
}

/**
 * 检查SSH密钥文件是否存在
 * @param keyPath SSH密钥文件路径
 * @returns 是否存在
 */
export function checkSshKeyExists(keyPath: string): boolean {
  const fullPath = keyPath.startsWith('~') ? path.join(os.homedir(), keyPath.slice(1)) : keyPath;

  return fs.existsSync(fullPath);
}

/**
 * 生成SSH配置块
 * @param account GitHub账号信息
 * @returns SSH配置块
 */
export function generateSshConfigBlock(account: GitHubAccount): string {
  const keyPath = `~/.ssh/id_rsa_${account.sshHostAlias.replace('github.com-', '')}`;

  return `
# ${account.gitUsername} (${account.githubUsername})
Host ${account.sshHostAlias}
  HostName github.com
  User git
  IdentityFile ${keyPath}
  IdentitiesOnly yes
`;
}

/**
 * 备份SSH配置文件
 * @returns 备份文件路径
 */
export function backupSshConfig(): string {
  try {
    if (!fs.existsSync(SSH_CONFIG_PATH)) {
      console.log(chalk.yellow(`SSH配置文件不存在，无需备份: ${SSH_CONFIG_PATH}`));
      return '';
    }

    const backupPath = `${SSH_CONFIG_PATH}.backup.${Date.now()}`;
    fs.copyFileSync(SSH_CONFIG_PATH, backupPath);
    console.log(chalk.green(`SSH配置文件已备份到: ${backupPath}`));
    return backupPath;
  } catch (error) {
    console.error(chalk.red('备份SSH配置文件时出错:'), error);
    return '';
  }
}

/**
 * 更新SSH配置文件（谨慎使用）
 * @param newConfig 新的SSH配置内容
 * @returns 是否成功
 */
export function updateSshConfig(newConfig: string): boolean {
  try {
    // 首先备份
    const backupPath = backupSshConfig();
    if (!backupPath) {
      return false;
    }

    // 确保.ssh目录存在
    const sshDir = path.dirname(SSH_CONFIG_PATH);
    if (!fs.existsSync(sshDir)) {
      fs.mkdirSync(sshDir, { recursive: true });
    }

    // 写入新配置
    fs.writeFileSync(SSH_CONFIG_PATH, newConfig, 'utf8');
    console.log(chalk.green(`SSH配置文件已更新: ${SSH_CONFIG_PATH}`));
    return true;
  } catch (error) {
    console.error(chalk.red('更新SSH配置文件时出错:'), error);
    return false;
  }
}

/**
 * 添加Host块到SSH配置文件
 * @param hostBlock 要添加的Host块
 * @returns 是否成功
 */
export function addHostToSshConfig(hostBlock: string): boolean {
  try {
    const config = readSshConfig();
    const newConfig = config ? `${config}\n${hostBlock}` : hostBlock;
    return updateSshConfig(newConfig);
  } catch (error) {
    console.error(chalk.red('添加Host块到SSH配置文件时出错:'), error);
    return false;
  }
}

/**
 * 创建SSH密钥
 * @param account GitHub账号信息
 * @param overwrite 是否覆盖现有密钥
 * @returns 是否成功创建以及公钥内容
 */
export async function createSshKey(account: GitHubAccount, overwrite: boolean = false): Promise<{ success: boolean; publicKey: string }> {
  try {
    const keyName = account.sshHostAlias.replace('github.com-', '');
    const keyPath = path.join(os.homedir(), '.ssh', `id_rsa_${keyName}`);
    const pubKeyPath = `${keyPath}.pub`;

    // 检查密钥是否已存在
    if (fs.existsSync(keyPath) && !overwrite) {
      console.log(chalk.yellow(`SSH密钥已存在: ${keyPath}`));

      // 读取现有公钥
      const publicKey = fs.existsSync(pubKeyPath) ? fs.readFileSync(pubKeyPath, 'utf8') : '';
      return { success: false, publicKey };
    }

    // 确保.ssh目录存在
    const sshDir = path.dirname(keyPath);
    if (!fs.existsSync(sshDir)) {
      fs.mkdirSync(sshDir, { recursive: true });
    }

    // 创建SSH密钥
    console.log(chalk.blue(`正在为账号 ${account.githubUsername} 创建SSH密钥...`));

    await execa('ssh-keygen', [
      '-t',
      'rsa',
      '-b',
      '4096',
      '-C',
      account.gitEmail,
      '-f',
      keyPath,
      '-N',
      '', // 空密码
    ]);

    console.log(chalk.green(`✅ SSH密钥已成功创建: ${keyPath}`));

    // 读取公钥
    const publicKey = fs.readFileSync(pubKeyPath, 'utf8');

    return { success: true, publicKey };
  } catch (error) {
    console.error(chalk.red('创建SSH密钥时出错:'), error);
    return { success: false, publicKey: '' };
  }
}

/**
 * 自动更新SSH配置
 * @param account GitHub账号信息
 * @returns 是否成功
 */
export function autoUpdateSshConfig(account: GitHubAccount): boolean {
  try {
    // 检查SSH主机别名是否已存在
    if (checkSshHostExists(account.sshHostAlias)) {
      console.log(chalk.green(`SSH主机别名 "${account.sshHostAlias}" 已存在于配置文件中`));
      return true;
    }

    // 生成SSH配置块
    const sshConfigBlock = generateSshConfigBlock(account);

    // 添加到SSH配置
    return addHostToSshConfig(sshConfigBlock);
  } catch (error) {
    console.error(chalk.red('自动更新SSH配置时出错:'), error);
    return false;
  }
}
