import execa from 'execa';
import path from 'path';
import fs from 'fs-extra';
import { GitHubAccount, RepoInfo } from '../types';
import chalk from 'chalk';
import axios from 'axios';
import { confirm } from './interactive';

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
    // 如果有GitHub令牌，使用API检查
    if (account.githubToken) {
      const response = await axios.get(`https://api.github.com/repos/${account.githubUsername}/${repoName}`, {
        headers: {
          Authorization: `token ${account.githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
        validateStatus: (status) => status < 500, // 不要因为404抛出错误
      });

      return response.status === 200;
    }

    // 没有令牌时回退到SSH方式检查
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
    // 如果有GitHub令牌，使用API自动创建仓库
    if (account.githubToken) {
      console.log(chalk.blue(`正在使用GitHub API创建仓库 "${account.githubUsername}/${repoName}"...`));

      try {
        const response = await axios.post(
          'https://api.github.com/user/repos',
          {
            name: repoName,
            private: isPrivate,
            auto_init: false,
            description: `Repository created by GitHub Account Manager`,
          },
          {
            headers: {
              Authorization: `token ${account.githubToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );

        if (response.status === 201) {
          console.log(chalk.green(`✅ 仓库创建成功: ${account.githubUsername}/${repoName}`));
          return;
        }
      } catch (apiError: any) {
        console.log(chalk.yellow(`使用GitHub API创建仓库失败: ${apiError.message}`));
        if (apiError.response?.data) {
          console.log(chalk.yellow('错误详情:'), apiError.response.data);
        }
      }
    }

    // 如果没有令牌或API创建失败，回退到手动创建方式
    await createGitHubRepoManually(account, repoName, isPrivate);
  } catch (error) {
    console.error(chalk.red('创建GitHub仓库过程中出错:'), error);
    process.exit(1);
  }
}

/**
 * 手动创建GitHub仓库
 * @param account GitHub账号信息
 * @param repoName 仓库名称
 * @param isPrivate 是否为私有仓库
 */
async function createGitHubRepoManually(account: GitHubAccount, repoName: string, isPrivate: boolean): Promise<void> {
  console.log(chalk.blue(`仓库 "${account.githubUsername}/${repoName}" 需要手动创建`));

  // 提示用户手动创建仓库
  console.log(chalk.yellow('请按照以下步骤手动创建GitHub仓库:'));
  console.log(chalk.yellow('1. 登录到 https://github.com/new'));
  console.log(chalk.yellow(`2. 仓库名称输入: ${repoName}`));
  console.log(chalk.yellow(`3. 仓库可见性选择: ${isPrivate ? '私有 (Private)' : '公开 (Public)'}`));
  console.log(chalk.yellow('4. 不要初始化仓库 (不要添加README, .gitignore或许可证)'));
  console.log(chalk.yellow('5. 点击"创建仓库"按钮'));

  let repoVerified = false;
  let retryCount = 0;
  const maxRetries = 3;

  while (!repoVerified && retryCount < maxRetries) {
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

    // 验证仓库是否真的存在
    console.log(chalk.blue('正在验证仓库是否已创建...'));
    repoVerified = await checkRepoExists(account, repoName);

    if (repoVerified) {
      console.log(chalk.green(`✅ 仓库验证成功: ${account.githubUsername}/${repoName}`));
    } else {
      retryCount++;
      if (retryCount < maxRetries) {
        console.log(chalk.red(`❌ 仓库验证失败，无法访问 ${account.githubUsername}/${repoName}`));
        console.log(chalk.yellow('可能的原因:'));
        console.log(chalk.yellow('1. 仓库尚未创建完成，GitHub需要一点时间'));
        console.log(chalk.yellow('2. 仓库名称与您输入的不一致'));
        console.log(chalk.yellow('3. SSH配置问题'));
        console.log(chalk.yellow(`请再次确认仓库已创建 (尝试 ${retryCount}/${maxRetries})`));
      } else {
        console.error(chalk.red(`❌ 多次验证失败，无法访问仓库。请手动检查以下内容:`));
        console.error(chalk.yellow('1. 确认仓库已在GitHub上成功创建'));
        console.error(chalk.yellow(`2. 确认SSH配置正确，可以通过运行 'ssh -T git@${account.sshHostAlias}' 测试`));
        console.error(chalk.yellow(`3. 确认您的SSH密钥已添加到GitHub账号 ${account.githubUsername}`));
        console.error(chalk.yellow('4. 确认仓库名称拼写正确'));
        process.exit(1);
      }
    }
  }

  console.log(chalk.green(`仓库已创建: ${account.githubUsername}/${repoName}`));
}

/**
 * 删除GitHub仓库
 * @param account GitHub账号信息
 * @param repoName 仓库名称
 */
export async function deleteGitHubRepo(account: GitHubAccount, repoName: string): Promise<void> {
  try {
    // 如果有GitHub令牌，使用API自动删除仓库
    if (account.githubToken) {
      console.log(chalk.blue(`正在使用GitHub API删除仓库 "${account.githubUsername}/${repoName}"...`));

      try {
        const response = await axios.delete(`https://api.github.com/repos/${account.githubUsername}/${repoName}`, {
          headers: {
            Authorization: `token ${account.githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });

        if (response.status === 204) {
          console.log(chalk.green(`✅ 仓库删除成功: ${account.githubUsername}/${repoName}`));
          return;
        }
      } catch (apiError: any) {
        console.log(chalk.yellow(`使用GitHub API删除仓库失败: ${apiError.message}`));
        if (apiError.response?.data) {
          console.log(chalk.yellow('错误详情:'), apiError.response.data);
        }
      }
    }

    // 如果没有令牌或API删除失败，回退到手动删除方式
    await deleteGitHubRepoManually(account, repoName);
  } catch (error) {
    console.error(chalk.red('删除GitHub仓库过程中出错:'), error);
    process.exit(1);
  }
}

/**
 * 手动删除GitHub仓库
 * @param account GitHub账号信息
 * @param repoName 仓库名称
 */
async function deleteGitHubRepoManually(account: GitHubAccount, repoName: string): Promise<void> {
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
}

/**
 * 推送所有代码到远程仓库
 * @param force 是否强制推送
 * @param defaultBranch 默认分支名称
 */
export async function pushToRemote(force: boolean = false, defaultBranch?: string): Promise<void> {
  try {
    // 获取当前分支名
    let currentBranch;
    try {
      const { stdout } = await execa('git', ['branch', '--show-current']);
      currentBranch = stdout.trim();
    } catch (error) {
      // 如果获取失败，尝试使用默认分支或HEAD
      currentBranch = '';
    }

    // 如果没有当前分支（可能是新仓库），使用默认分支或HEAD
    const branchToUse = currentBranch || defaultBranch || 'HEAD';

    // 构建推送命令
    const args = ['push', '--set-upstream', 'origin'];

    // 如果使用HEAD，不需要指定源和目标分支
    if (branchToUse === 'HEAD') {
      args.push('HEAD');
    } else {
      // 否则使用 本地分支:远程分支 格式
      args.push(`${branchToUse}:${branchToUse}`);
    }

    if (force) args.push('--force');

    console.log(chalk.blue(`正在推送代码到远程仓库 (分支: ${branchToUse})...`));
    await execa('git', args);
    console.log(chalk.green(`代码已成功推送到远程仓库 (分支: ${branchToUse})`));
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
    } else if (error.stderr && error.stderr.includes('refusing to update checked out branch')) {
      console.error(chalk.red('无法推送到当前检出的分支。请尝试:'));
      console.error(chalk.yellow('1. 在GitHub上手动创建一个初始提交'));
      console.error(chalk.yellow('2. 然后运行 git pull origin main --allow-unrelated-histories'));
      console.error(chalk.yellow('3. 然后再次尝试推送'));
    } else if (error.stderr && error.stderr.includes('Updates were rejected')) {
      console.error(chalk.red('推送被拒绝。可能的原因:'));
      console.error(chalk.yellow('1. 远程分支已经存在且历史不同'));
      console.error(chalk.yellow('2. 尝试添加 --force 参数强制推送'));
      console.error(chalk.yellow('3. 或者先执行 git pull --rebase 再推送'));
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

/**
 * 创建初始提交
 */
export async function createInitialCommit(): Promise<void> {
  try {
    // 检查是否有文件可提交
    const { stdout: status } = await execa('git', ['status', '--porcelain']);

    if (status.trim()) {
      // 有未提交的文件，询问是否添加并提交
      const shouldCommit = await confirm('检测到未提交的文件，是否添加并提交?', true);
      if (shouldCommit) {
        await execa('git', ['add', '.']);
        await execa('git', ['commit', '-m', '初始提交']);
      }
    } else {
      // 没有未提交的文件，创建空提交
      const shouldCreateEmptyCommit = await confirm('没有文件可提交，是否创建空提交?', true);
      if (shouldCreateEmptyCommit) {
        await execa('git', ['commit', '--allow-empty', '-m', '初始提交']);
      }
    }
  } catch (error) {
    console.error(chalk.red('创建初始提交失败:'), error);
  }
}
