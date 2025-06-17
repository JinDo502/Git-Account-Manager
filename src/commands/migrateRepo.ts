import chalk from 'chalk';
import { getAccount } from '../utils/config';
import { getCurrentRepoInfo, setGitConfig, checkRepoExists, updateRemoteUrl, pushToRemote, deleteGitHubRepo } from '../utils/git';
import { selectAccount, confirm, confirmDangerousAction, input } from '../utils/interactive';

interface MigrateOptions {
  deleteSource?: boolean;
}

/**
 * 迁移仓库命令处理函数
 * @param sourceAccountName 源账号名称
 * @param targetAccountName 目标账号名称
 * @param options 选项
 */
export async function migrateRepo(sourceAccountName?: string, targetAccountName?: string, options: MigrateOptions = {}): Promise<void> {
  try {
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

    // 如果没有提供源账号名称，让用户选择一个账号
    if (!sourceAccountName) {
      sourceAccountName = await selectAccount('选择源GitHub账号:');
    }

    // 获取源账号信息
    const { account: sourceAccount } = getAccount(sourceAccountName);

    // 如果没有提供目标账号名称，让用户选择一个账号
    if (!targetAccountName) {
      // 过滤掉源账号
      targetAccountName = await selectAccount('选择目标GitHub账号:', sourceAccountName === getAccount().name ? undefined : getAccount().name);

      // 确保源账号和目标账号不同
      if (sourceAccountName === targetAccountName) {
        console.error(chalk.red('源账号和目标账号不能相同'));
        process.exit(1);
      }
    }

    // 获取目标账号信息
    const { account: targetAccount } = getAccount(targetAccountName);

    console.log(chalk.blue(`准备将仓库 "${repoInfo.name}" 从账号 "${sourceAccountName}" 迁移到账号 "${targetAccountName}"...`));

    // 如果是新初始化的仓库，不需要检查目标仓库是否存在
    let targetRepoExists = false;
    if (!shouldInit) {
      // 检查目标账号中是否已存在同名仓库
      targetRepoExists = await checkRepoExists(targetAccount, repoInfo.name);

      if (targetRepoExists) {
        const shouldContinue = await confirm(`警告: 目标账号 "${targetAccountName}" 中已存在名为 "${repoInfo.name}" 的仓库。继续操作将覆盖现有仓库。是否继续?`, false);

        if (!shouldContinue) {
          console.log(chalk.yellow('迁移操作已取消'));
          process.exit(0);
        }
      }
    }

    // 更新Git配置为目标账号
    await setGitConfig(targetAccount);

    // 询问是否为私有仓库
    const isPrivate = await confirm('是否将仓库设置为私有?', true);

    // 更新远程URL为目标账号（如果需要会创建远程仓库）
    await updateRemoteUrl(targetAccount, repoInfo, true, isPrivate);

    // 如果是新初始化的仓库，创建并推送初始提交
    if (shouldInit) {
      await createInitialCommit();
    }

    // 推送所有代码到目标仓库
    await pushToRemote(true);

    console.log(chalk.green(`✅ 仓库已成功迁移到账号 "${targetAccountName}" (${targetAccount.githubUsername})`));

    // 如果指定了删除源仓库选项，并且不是新初始化的仓库
    if (options.deleteSource && !shouldInit) {
      const confirmDelete = await confirmDangerousAction(`你正在尝试删除账号 "${sourceAccountName}" 中的仓库 "${repoInfo.name}"。此操作不可逆!`, `DELETE-${repoInfo.name}`);

      if (confirmDelete) {
        await deleteGitHubRepo(sourceAccount, repoInfo.name);
        console.log(chalk.green(`✅ 源仓库已从账号 "${sourceAccountName}" 中删除`));
      } else {
        console.log(chalk.yellow('已取消删除源仓库'));
      }
    }
  } catch (error) {
    console.error(chalk.red('迁移仓库时出错:'), error);
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
