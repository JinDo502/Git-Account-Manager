import chalk from 'chalk';
import { getAccount } from '../utils/config';
import { getCurrentRepoInfo, setGitConfig, updateRemoteUrl } from '../utils/git';
import { selectAccount, confirm, input } from '../utils/interactive';

/**
 * 切换账号命令处理函数
 * @param accountName 账号名称
 */
export async function switchAccount(accountName?: string): Promise<void> {
  try {
    // 如果没有提供账号名称，让用户选择一个账号
    if (!accountName) {
      accountName = await selectAccount('选择要切换到的GitHub账号:');
    }

    // 获取账号信息
    const { account } = getAccount(accountName);

    // 检查是否是Git仓库，如果不是，询问是否初始化
    const isInitializing = !(await getCurrentRepoInfo(false));
    let shouldInit = false;

    if (isInitializing) {
      shouldInit = await confirm('当前目录不是Git仓库，是否要初始化?', true);
      if (!shouldInit) {
        console.log(chalk.yellow('操作已取消'));
        process.exit(0);
      }
    }

    // 获取当前仓库信息（如果需要会初始化）
    const repoInfo = await getCurrentRepoInfo(shouldInit);

    if (!repoInfo) {
      console.error(chalk.red('无法获取仓库信息'));
      process.exit(1);
    }

    // 如果是新初始化的仓库，询问是否要自定义仓库名称
    if (shouldInit) {
      const customRepoName = await input('输入仓库名称 (留空使用当前目录名):', repoInfo.name);
      if (customRepoName && customRepoName !== repoInfo.name) {
        repoInfo.name = customRepoName;
      }
    }

    console.log(chalk.blue(`正在将仓库 "${repoInfo.name}" 切换到账号 "${accountName}" (${account.githubUsername})...`));

    // 更新Git配置
    await setGitConfig(account);

    // 更新远程URL
    await updateRemoteUrl(account, repoInfo);

    // 如果是新初始化的仓库，询问是否要在GitHub上创建远程仓库
    if (shouldInit) {
      const shouldCreateRemote = await confirm('是否要在GitHub上创建远程仓库?', true);
      if (shouldCreateRemote) {
        const isPrivate = await confirm('是否将新仓库设置为私有?', true);
        await createAndPushRepo(account, repoInfo.name, isPrivate);
      }
    }

    console.log(chalk.green(`✅ 仓库已成功切换到账号 "${accountName}" (${account.githubUsername})`));
  } catch (error) {
    console.error(chalk.red('切换账号时出错:'), error);
    process.exit(1);
  }
}

/**
 * 创建远程仓库并推送代码
 * @param account GitHub账号信息
 * @param repoName 仓库名称
 * @param isPrivate 是否为私有仓库
 */
async function createAndPushRepo(account: any, repoName: string, isPrivate: boolean): Promise<void> {
  const { createGitHubRepo, pushToRemote } = await import('../utils/git');

  // 创建远程仓库
  await createGitHubRepo(account, repoName, isPrivate);

  // 创建初始提交
  const execa = (await import('execa')).default;

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

    // 推送到远程
    await pushToRemote();
  } catch (error) {
    console.error(chalk.red('创建初始提交失败:'), error);
  }
}
