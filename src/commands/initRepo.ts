import chalk from 'chalk';
import { getAccount } from '../utils/config';
import { getCurrentRepoInfo, setGitConfig, updateRemoteUrl, initGitRepo } from '../utils/git';
import { selectAccount, confirm, input } from '../utils/interactive';

/**
 * 初始化仓库命令处理函数
 * @param accountName 账号名称
 */
export async function initRepo(accountName?: string): Promise<void> {
  try {
    // 如果没有提供账号名称，让用户选择一个账号
    if (!accountName) {
      accountName = await selectAccount('选择要使用的GitHub账号:');
    }

    // 获取账号信息
    const { account } = getAccount(accountName);

    // 初始化Git仓库
    const initialized = await initGitRepo();
    if (!initialized) {
      console.error(chalk.red('无法初始化Git仓库'));
      process.exit(1);
    }

    // 获取当前仓库信息
    const repoInfo = await getCurrentRepoInfo(true);
    if (!repoInfo) {
      console.error(chalk.red('无法获取仓库信息'));
      process.exit(1);
    }

    // 询问用户是否要自定义仓库名称
    const customRepoName = await input('输入仓库名称 (留空使用当前目录名):', repoInfo.name);
    if (customRepoName && customRepoName !== repoInfo.name) {
      repoInfo.name = customRepoName;
    }

    console.log(chalk.blue(`正在初始化仓库 "${repoInfo.name}" 使用账号 "${accountName}" (${account.githubUsername})...`));

    // 更新Git配置
    await setGitConfig(account);

    // 询问是否要创建为私有仓库
    const isPrivate = await confirm('是否将仓库设置为私有?', true);

    // 更新远程URL（如果需要会创建远程仓库）
    await updateRemoteUrl(account, repoInfo, true, isPrivate);

    // 询问是否要创建初始提交并推送
    const shouldCreateCommit = await confirm('是否要创建初始提交并推送到远程仓库?', true);
    if (shouldCreateCommit) {
      await createInitialCommit();
      await pushToRemote();
    }

    console.log(chalk.green(`✅ 仓库已成功初始化并配置为账号 "${accountName}" (${account.githubUsername})`));
  } catch (error) {
    console.error(chalk.red('初始化仓库时出错:'), error);
    process.exit(1);
  }
}

/**
 * 创建初始提交
 */
async function createInitialCommit(): Promise<void> {
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
  } catch (error) {
    console.error(chalk.red('创建初始提交失败:'), error);
  }
}

/**
 * 推送到远程仓库
 */
async function pushToRemote(): Promise<void> {
  const { pushToRemote: pushToRemoteUtil } = await import('../utils/git');
  await pushToRemoteUtil();
}
