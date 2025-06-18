import chalk from 'chalk';
import { getAccount, updateAccount } from '../utils/config';
import { getCurrentRepoInfo, setGitConfig, updateRemoteUrl, initGitRepo, createInitialCommit, pushToRemote } from '../utils/git';
import { selectAccount, confirm, input } from '../utils/interactive';

/**
 * 初始化仓库命令处理函数
 * @param accountName 账号名称
 * @param options 命令选项
 */
export async function initRepo(accountName?: string, options?: { private?: boolean; name?: string }): Promise<void> {
  try {
    // 如果没有提供账号名称，让用户选择一个账号
    if (!accountName) {
      accountName = await selectAccount('选择要使用的GitHub账号:');
    }

    // 获取账号信息
    const { account } = getAccount(accountName);

    // 检查是否有GitHub令牌，如果没有则提示用户输入
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

    // 使用命令行选项中的仓库名称，或询问用户是否要自定义仓库名称
    if (options?.name) {
      repoInfo.name = options.name;
    } else {
      const customRepoName = await input('输入仓库名称 (留空使用当前目录名):', repoInfo.name);
      if (customRepoName && customRepoName !== repoInfo.name) {
        repoInfo.name = customRepoName;
      }
    }

    console.log(chalk.blue(`正在初始化仓库 "${repoInfo.name}" 使用账号 "${accountName}" (${account.githubUsername})...`));

    // 更新Git配置
    await setGitConfig(account);

    // 使用命令行选项中的私有设置，或询问是否要创建为私有仓库
    const isPrivate = options?.private !== undefined ? options.private : await confirm('是否将仓库设置为私有?', true);

    // 更新远程URL（如果需要会创建远程仓库）
    await updateRemoteUrl(account, repoInfo, true, isPrivate);

    // 询问是否要创建初始提交并推送
    const shouldCreateCommit = await confirm('是否要创建初始提交并推送到远程仓库?', true);
    if (shouldCreateCommit) {
      await createInitialCommit();
      await pushToRemote(false, 'main'); // 使用main作为默认分支
    }

    console.log(chalk.green(`✅ 仓库已成功初始化并配置为账号 "${accountName}" (${account.githubUsername})`));
  } catch (error) {
    console.error(chalk.red('初始化仓库时出错:'), error);
    process.exit(1);
  }
}
