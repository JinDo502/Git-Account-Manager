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
 * 更新远程URL
 * @param account GitHub账号信息
 * @param repoInfo 仓库信息
 */
export async function updateRemoteUrl(account: GitHubAccount, repoInfo: RepoInfo): Promise<void> {
  try {
    // 构建新的SSH URL，使用账号的SSH别名
    const newSshUrl = `git@${account.sshHostAlias}:${account.githubUsername}/${repoInfo.name}.git`;

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

    // 更新仓库信息
    repoInfo.owner = account.githubUsername;
    repoInfo.fullName = `${account.githubUsername}/${repoInfo.name}`;
    repoInfo.sshUrl = newSshUrl;
    repoInfo.httpsUrl = `https://github.com/${repoInfo.fullName}.git`;
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
    // 使用gh CLI检查仓库是否存在，使用标准的github.com主机名
    await execa('gh', ['repo', 'view', `${account.githubUsername}/${repoName}`, '--json', 'name'], {
      env: { GH_HOST: 'github.com' },
    });
    return true;
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
    const args = ['repo', 'create', repoName];
    if (isPrivate) args.push('--private');
    else args.push('--public');

    // 使用gh CLI创建仓库，使用标准的github.com主机名
    await execa('gh', args, {
      env: { GH_HOST: 'github.com' },
    });

    console.log(chalk.green(`仓库已创建: ${account.githubUsername}/${repoName}`));
  } catch (error) {
    console.error(chalk.red('创建GitHub仓库失败:'), error);
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
    // 使用gh CLI删除仓库，使用标准的github.com主机名
    await execa('gh', ['repo', 'delete', `${account.githubUsername}/${repoName}`, '--yes'], {
      env: { GH_HOST: 'github.com' },
    });

    console.log(chalk.green(`仓库已删除: ${account.githubUsername}/${repoName}`));
  } catch (error) {
    console.error(chalk.red('删除GitHub仓库失败:'), error);
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

    await execa('git', args);
    console.log(chalk.green('代码已推送到远程仓库'));
  } catch (error) {
    console.error(chalk.red('推送代码失败:'), error);
    process.exit(1);
  }
}
