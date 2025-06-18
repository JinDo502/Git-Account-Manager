import chalk from 'chalk';
import { getAccount, updateAccount } from '../utils/config';
import { getCurrentRepoInfo, setGitConfig, checkRepoExists, updateRemoteUrl, pushToRemote, deleteGitHubRepo, createInitialCommit } from '../utils/git';
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

    // 检查目标账号是否有GitHub令牌，如果没有则提示用户输入
    if (!targetAccount.githubToken) {
      console.log(chalk.yellow(`目标账号 "${targetAccountName}" 没有配置GitHub令牌，需要令牌才能自动创建仓库。`));

      const inquirer = (await import('inquirer')).default;
      const { inputToken } = await inquirer.prompt([
        {
          type: 'password',
          name: 'inputToken',
          message: '请输入GitHub个人访问令牌 (PAT):',
          validate: (input: string) => {
            if (!input.trim()) {
              return '令牌不能为空';
            }
            return true;
          },
        },
      ]);

      // 更新账号信息，添加令牌
      updateAccount(targetAccountName, { githubToken: inputToken });
      targetAccount.githubToken = inputToken;
      console.log(chalk.green(`✅ GitHub令牌已成功设置到账号 "${targetAccountName}"`));
    }

    // 如果要删除源仓库，检查源账号是否有GitHub令牌
    if (options.deleteSource && !sourceAccount.githubToken) {
      console.log(chalk.yellow(`源账号 "${sourceAccountName}" 没有配置GitHub令牌，需要令牌才能自动删除仓库。`));

      const inquirer = (await import('inquirer')).default;
      const { inputToken } = await inquirer.prompt([
        {
          type: 'password',
          name: 'inputToken',
          message: '请输入源账号的GitHub个人访问令牌 (PAT):',
          validate: (input: string) => {
            if (!input.trim()) {
              return '令牌不能为空';
            }
            return true;
          },
        },
      ]);

      // 更新账号信息，添加令牌
      updateAccount(sourceAccountName, { githubToken: inputToken });
      sourceAccount.githubToken = inputToken;
      console.log(chalk.green(`✅ GitHub令牌已成功设置到源账号 "${sourceAccountName}"`));
    }

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

    // 询问是否需要创建远程仓库（如果不是新初始化的仓库，且目标仓库不存在）
    const shouldCreateRemote = shouldInit || !targetRepoExists;

    // 如果需要创建远程仓库，询问是否设为私有
    let isPrivate = true;
    if (shouldCreateRemote) {
      isPrivate = !(await confirm('是否将仓库设置为公开(Public)仓库? 选择"否"则创建为私有(Private)仓库', false));
    }

    // 更新远程URL（如果需要会创建远程仓库）
    // 不自动设置上游追踪分支，稍后单独询问
    await updateRemoteUrl(targetAccount, repoInfo, true, isPrivate, false);

    // 询问是否设置上游追踪分支
    const shouldSetupUpstream = await confirm('是否设置上游追踪分支?', true);

    if (shouldSetupUpstream) {
      const { setupUpstreamBranch } = await import('../utils/git');
      await setupUpstreamBranch('origin', 'main');
    }

    // 如果是新初始化的仓库，创建初始提交
    if (shouldInit) {
      await createInitialCommit();
    }

    // 询问是否推送代码到目标仓库
    const shouldPush = await confirm('是否推送代码到目标仓库?', true);
    if (shouldPush) {
      // 推送所有代码到目标仓库
      await pushToRemote(true, 'main');
    }

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
