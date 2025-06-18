import execa from 'execa';
import path from 'path';
import fs from 'fs-extra';
import { GitHubAccount, RepoInfo } from '../types';
import chalk from 'chalk';

/**
 * 检查当前目录是否是Git仓库
 * @returns 是否是Git仓库
 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 初始化Git仓库
 * @returns 是否成功初始化
 */
export async function initGitRepo(): Promise<boolean> {
  try {
    await execa('git', ['init']);
    console.log(chalk.green('Git仓库已初始化'));
    return true;
  } catch (error) {
    console.error(chalk.red('初始化Git仓库失败:'), error);
    return false;
  }
}

/**
 * 获取仓库根目录
 * @returns 仓库根目录路径
 */
export async function getRepoRoot(): Promise<string> {
  try {
    const { stdout } = await execa('git', ['rev-parse', '--show-toplevel']);
    return stdout;
  } catch (error) {
    console.error(chalk.red('获取仓库根目录失败:'), error);
    process.exit(1);
  }
}

/**
 * 获取当前仓库的远程URL
 * @returns 远程URL
 */
export async function getRemoteUrl(): Promise<string> {
  try {
    const { stdout } = await execa('git', ['remote', 'get-url', 'origin']);
    return stdout;
  } catch (error) {
    return '';
  }
}

/**
 * 解析仓库URL，获取仓库信息
 * @param url 仓库URL
 * @returns 仓库信息
 */
export function parseRepoUrl(url: string): RepoInfo | null {
  if (!url) return null;

  // 匹配SSH URL: git@github.com:username/repo.git 或 git@github.com-alias:username/repo.git
  const sshMatch = url.match(/git@([^:]+):([^/]+)\/([^.]+)(\.git)?/);
  if (sshMatch) {
    const [, host, owner, name] = sshMatch;
    const fullName = `${owner}/${name}`;
    return {
      name,
      owner,
      fullName,
      sshUrl: `git@github.com:${fullName}.git`,
      httpsUrl: `https://github.com/${fullName}.git`,
      exists: true,
    };
  }

  // 匹配HTTPS URL: https://github.com/username/repo.git
  const httpsMatch = url.match(/https:\/\/github\.com\/([^/]+)\/([^.]+)(\.git)?/);
  if (httpsMatch) {
    const [, owner, name] = httpsMatch;
    const fullName = `${owner}/${name}`;
    return {
      name,
      owner,
      fullName,
      sshUrl: `git@github.com:${fullName}.git`,
      httpsUrl: `https://github.com/${fullName}.git`,
      exists: true,
    };
  }

  return null;
}

/**
 * 获取当前目录名称
 * @returns 目录名称
 */
export function getCurrentDirName(): string {
  return path.basename(process.cwd());
}

/**
 * 获取当前仓库信息
 * @param shouldInitIfNeeded 如果不是Git仓库，是否应该初始化
 * @returns 仓库信息
 */
export async function getCurrentRepoInfo(shouldInitIfNeeded: boolean = false): Promise<RepoInfo | null> {
  const isRepo = await isGitRepo();

  if (!isRepo) {
    if (!shouldInitIfNeeded) {
      console.error(chalk.red('当前目录不是Git仓库'));
      process.exit(1);
    }

    const initialized = await initGitRepo();
    if (!initialized) {
      console.error(chalk.red('无法初始化Git仓库'));
      process.exit(1);
    }
  }

  const remoteUrl = await getRemoteUrl();
  if (remoteUrl) {
    return parseRepoUrl(remoteUrl);
  }

  // 如果没有远程URL，则创建一个基于当前目录名的仓库信息
  const dirName = getCurrentDirName();
  return {
    name: dirName,
    owner: '', // 将在设置远程URL时填充
    fullName: '', // 将在设置远程URL时填充
    sshUrl: '',
    httpsUrl: '',
    exists: false,
  };
}

/**
 * 设置Git配置
 * @param account GitHub账号信息
 * @param scope 配置范围 ('global' | 'local')
 */
export async function setGitConfig(account: GitHubAccount, scope: 'global' | 'local' = 'local'): Promise<void> {
  try {
    await execa('git', ['config', `--${scope}`, 'user.name', account.gitUsername]);
    await execa('git', ['config', `--${scope}`, 'user.email', account.gitEmail]);
    console.log(chalk.green(`Git ${scope} 配置已更新为: ${account.gitUsername} <${account.gitEmail}>`));
  } catch (error) {
    console.error(chalk.red(`设置Git ${scope} 配置失败:`), error);
    process.exit(1);
  }
}

/**
 * 检查SSH连接是否可用
 * @param sshHost SSH主机名
 * @returns 是否可用
 */
export async function checkSshConnection(sshHost: string): Promise<boolean> {
  try {
    console.log(chalk.blue(`正在测试SSH连接: ${sshHost}...`));

    // 使用-o StrictHostKeyChecking=no避免首次连接时的主机验证提示
    // 使用-o IdentitiesOnly=yes确保只使用指定的身份文件
    // 增加超时时间到10秒，给连接更多时间
    const { exitCode, stderr } = await execa('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'IdentitiesOnly=yes', `git@${sshHost}`], {
      reject: false,
      timeout: 10000,
    });

    // GitHub的成功响应是"Hi username! You've successfully authenticated..."
    // 即使身份验证成功，exitCode通常也是1（因为shell访问被拒绝）
    if (stderr.includes('successfully authenticated') || exitCode === 1) {
      console.log(chalk.green(`SSH连接成功: ${sshHost}`));
      return true;
    }

    console.log(chalk.yellow(`SSH连接测试失败: ${sshHost}`));
    console.log(chalk.yellow(`错误信息: ${stderr}`));
    return false;
  } catch (error: any) {
    console.error(chalk.yellow(`SSH连接测试失败: ${sshHost}`));

    // 提供更详细的错误信息
    if (error.code === 'ENOENT') {
      console.error(chalk.red('SSH命令不可用。请确保已安装SSH客户端。'));
    } else if (error.code === 'ETIMEDOUT') {
      console.error(chalk.red('SSH连接超时。请检查网络连接和SSH主机配置。'));
    } else {
      console.error(error);
    }

    return false;
  }
}

/**
 * 更新远程URL
 * @param account GitHub账号信息
 * @param repoInfo 仓库信息
 * @param createIfNotExists 如果仓库不存在是否创建
 * @param isPrivate 如果需要创建，是否为私有仓库
 */
export async function updateRemoteUrl(account: GitHubAccount, repoInfo: RepoInfo, createIfNotExists: boolean = true, isPrivate: boolean = true): Promise<void> {
  try {
    // 检查SSH连接是否可用
    const sshConnected = await checkSshConnection(account.sshHostAlias);
    if (!sshConnected) {
      console.log(chalk.yellow(`警告: 无法连接到SSH主机 ${account.sshHostAlias}，将尝试使用标准的github.com主机名`));
    }

    // 更新仓库信息
    repoInfo.owner = account.githubUsername;
    repoInfo.fullName = `${account.githubUsername}/${repoInfo.name}`;

    // 使用正确的SSH主机名
    const sshHost = sshConnected ? account.sshHostAlias : 'github.com';
    repoInfo.sshUrl = `git@${sshHost}:${account.githubUsername}/${repoInfo.name}.git`;
    repoInfo.httpsUrl = `https://github.com/${repoInfo.fullName}.git`;

    // 如果需要，检查远程仓库是否存在，不存在则创建
    if (createIfNotExists) {
      const repoExists = await checkRepoExists(account, repoInfo.name);
      if (!repoExists) {
        console.log(chalk.yellow(`远程仓库 "${repoInfo.fullName}" 不存在，正在创建...`));
        await createGitHubRepo(account, repoInfo.name, isPrivate);
      }
    }

    // 构建新的SSH URL
    const newSshUrl = repoInfo.sshUrl;

    // 检查是否已有origin远程
    const hasOrigin = await checkRemoteExists('origin');

    if (hasOrigin) {
      // 更新现有的origin
      await execa('git', ['remote', 'set-url', 'origin', newSshUrl]);
      console.log(chalk.green(`远程URL已更新为: ${newSshUrl}`));
    } else {
      // 添加新的origin
      await execa('git', ['remote', 'add', 'origin', newSshUrl]);
      console.log(chalk.green(`远程URL已添加: ${newSshUrl}`));
    }
  } catch (error) {
    console.error(chalk.red('更新远程URL失败:'), error);
    process.exit(1);
  }
}

/**
 * 检查远程是否存在
 * @param remoteName 远程名称
 * @returns 远程是否存在
 */
export async function checkRemoteExists(remoteName: string): Promise<boolean> {
  try {
    const { stdout } = await execa('git', ['remote']);
    const remotes = stdout.split('\n');
    return remotes.includes(remoteName);
  } catch (error) {
    return false;
  }
}

/**
 * 检查仓库是否存在于GitHub上
 * @param account GitHub账号信息
 * @param repoName 仓库名称
 * @returns 仓库是否存在
 */
export async function checkRepoExists(account: GitHubAccount, repoName: string): Promise<boolean> {
  try {
    // 使用SSH方式检查仓库是否存在
    const sshUrl = `git@${account.sshHostAlias}:${account.githubUsername}/${repoName}.git`;
    const { exitCode } = await execa('git', ['ls-remote', '--exit-code', sshUrl, 'HEAD'], { reject: false });

    return exitCode === 0;
  } catch (error) {
    return false;
  }
}

/**
 * 创建GitHub仓库
 * @param account GitHub账号信息
 * @param repoName 仓库名称
 * @param isPrivate 是否为私有仓库
 */
export async function createGitHubRepo(account: GitHubAccount, repoName: string, isPrivate: boolean = false): Promise<void> {
  try {
    console.log(chalk.blue(`仓库 "${account.githubUsername}/${repoName}" 需要手动创建`));

    // 提示用户手动创建仓库
    console.log(chalk.yellow('请按照以下步骤手动创建GitHub仓库:'));
    console.log(chalk.yellow('1. 登录到 https://github.com/new'));
    console.log(chalk.yellow(`2. 仓库名称输入: ${repoName}`));
    console.log(chalk.yellow(`3. 仓库可见性选择: ${isPrivate ? '私有 (Private)' : '公开 (Public)'}`));
    console.log(chalk.yellow('4. 不要初始化仓库 (不要添加README, .gitignore或许可证)'));
    console.log(chalk.yellow('5. 点击"创建仓库"按钮'));

    // 等待用户确认已创建仓库
    const inquirer = (await import('inquirer')).default;
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: '是否已完成创建仓库?',
        default: false,
      },
    ]);

    if (!confirmed) {
      console.log(chalk.yellow('操作已取消'));
      process.exit(0);
    }

    console.log(chalk.green(`仓库已创建: ${account.githubUsername}/${repoName}`));
  } catch (error) {
    console.error(chalk.red('创建GitHub仓库过程中出错:'), error);
    process.exit(1);
  }
}

/**
 * 删除GitHub仓库
 * @param account GitHub账号信息
 * @param repoName 仓库名称
 */
export async function deleteGitHubRepo(account: GitHubAccount, repoName: string): Promise<void> {
  try {
    // 提示用户手动删除仓库
    console.log(chalk.yellow('请按照以下步骤手动删除GitHub仓库:'));
    console.log(chalk.yellow(`1. 访问 https://github.com/${account.githubUsername}/${repoName}/settings`));
    console.log(chalk.yellow('2. 滚动到页面底部的 "Danger Zone" 区域'));
    console.log(chalk.yellow('3. 点击 "Delete this repository" 按钮'));
    console.log(chalk.yellow(`4. 输入 "${account.githubUsername}/${repoName}" 进行确认`));
    console.log(chalk.yellow('5. 点击确认删除按钮'));

    // 等待用户确认已删除仓库
    const inquirer = (await import('inquirer')).default;
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: '是否已完成删除仓库?',
        default: false,
      },
    ]);

    if (!confirmed) {
      console.log(chalk.yellow('操作已取消'));
      process.exit(0);
    }

    console.log(chalk.green(`仓库已删除: ${account.githubUsername}/${repoName}`));
  } catch (error) {
    console.error(chalk.red('删除GitHub仓库过程中出错:'), error);
    process.exit(1);
  }
}

/**
 * 推送所有代码到远程仓库
 * @param force 是否强制推送
 */
export async function pushToRemote(force: boolean = false): Promise<void> {
  try {
    const args = ['push', '--set-upstream', 'origin', 'HEAD'];
    if (force) args.push('--force');

    console.log(chalk.blue(`正在推送代码到远程仓库...`));
    await execa('git', args);
    console.log(chalk.green('代码已成功推送到远程仓库'));
  } catch (error: any) {
    console.error(chalk.red('推送代码失败:'));

    // 提供更详细的错误诊断
    if (error.stderr && error.stderr.includes('Repository not found')) {
      console.error(chalk.red('远程仓库未找到。请确认:'));
      console.error(chalk.yellow('1. 您已在GitHub上创建了该仓库'));
      console.error(chalk.yellow('2. 您的SSH密钥已添加到正确的GitHub账号'));
      console.error(chalk.yellow('3. 您的~/.ssh/config配置正确'));
      console.error(chalk.yellow('4. 仓库名称拼写正确'));
    } else if (error.stderr && error.stderr.includes('Permission denied')) {
      console.error(chalk.red('权限被拒绝。请确认:'));
      console.error(chalk.yellow('1. 您的SSH密钥已添加到正确的GitHub账号'));
      console.error(chalk.yellow('2. 您对该仓库有写入权限'));
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}
