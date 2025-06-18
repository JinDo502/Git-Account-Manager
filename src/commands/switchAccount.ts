import chalk from 'chalk';
import { getAccount, updateAccount } from '../utils/config';
import { getCurrentRepoInfo, setGitConfig, updateRemoteUrl, createInitialCommit, pushToRemote } from '../utils/git';
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

      // 如果要初始化，检查是否有GitHub令牌，如果没有则提示用户输入
      if (!account.githubToken) {
        console.log(chalk.yellow(`账号 "${accountName}" 没有配置GitHub令牌，需要令牌才能自动创建仓库。`));

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
        updateAccount(accountName, { githubToken: inputToken });
        account.githubToken = inputToken;
        console.log(chalk.green(`✅ GitHub令牌已成功设置到账号 "${accountName}"`));
      }
    }

    // 获取当前仓库信息（如果需要会初始化）
    const repoInfo = await getCurrentRepoInfo(shouldInit);

    if (!repoInfo) {
      console.error(chalk.red('无法获取仓库信息'));
      process.exit(1);
    }

    // 询问用户输入仓库名称（无论是否为初始化仓库）
    const customRepoName = await input('输入仓库名称 (留空使用当前目录名):', repoInfo.name);
    if (customRepoName && customRepoName !== repoInfo.name) {
      repoInfo.name = customRepoName;
    }

    console.log(chalk.blue(`正在将仓库 "${repoInfo.name}" 切换到账号 "${accountName}" (${account.githubUsername})...`));

    // 更新Git配置
    await setGitConfig(account);

    // 询问是否创建远程仓库
    const shouldCreateRemote = await confirm('是否创建/更新远程仓库?', true);

    if (shouldCreateRemote) {
      // 如果需要创建远程仓库，询问是否要创建为私有仓库
      let isPrivate = true;

      // 无论是否为初始化仓库，都询问是否设置为公开仓库
      isPrivate = !(await confirm('是否将仓库设置为公开(Public)仓库? 选择"否"则创建为私有(Private)仓库', false));

      // 更新远程URL（如果需要会创建远程仓库）
      // 不自动设置上游追踪分支，稍后单独询问
      await updateRemoteUrl(account, repoInfo, true, isPrivate, false);

      // 询问是否设置上游追踪分支
      const shouldSetupUpstream = await confirm('是否设置上游追踪分支?', true);

      if (shouldSetupUpstream) {
        const { setupUpstreamBranch } = await import('../utils/git');
        await setupUpstreamBranch('origin', 'main');
      }

      // 如果是新初始化的仓库，询问是否要创建初始提交并推送
      if (shouldInit) {
        const shouldCreateCommit = await confirm('是否要创建初始提交?', true);
        if (shouldCreateCommit) {
          await createInitialCommit();

          // 询问是否推送到远程仓库
          const shouldPush = await confirm('是否推送到远程仓库?', true);
          if (shouldPush) {
            await pushToRemote(false, 'main');
          }
        }
      } else {
        // 如果不是新初始化的仓库，询问是否推送现有代码
        const shouldPush = await confirm('是否推送现有代码到远程仓库?', false);
        if (shouldPush) {
          await pushToRemote(false, 'main');
        }
      }
    }

    console.log(chalk.green(`✅ 仓库已成功切换到账号 "${accountName}" (${account.githubUsername})`));
  } catch (error) {
    console.error(chalk.red('切换账号时出错:'), error);
    process.exit(1);
  }
}
