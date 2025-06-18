import chalk from 'chalk';
import { getAccount, updateAccount } from '../utils/config';
import { selectAccount } from '../utils/interactive';

/**
 * 设置GitHub令牌命令处理函数
 * @param token GitHub个人访问令牌
 * @param accountName 账号名称
 */
export async function setToken(token?: string, accountName?: string): Promise<void> {
  try {
    // 如果没有提供账号名称，让用户选择一个账号
    if (!accountName) {
      accountName = await selectAccount('选择要设置令牌的GitHub账号:');
    }

    // 获取账号信息
    const { account } = getAccount(accountName);

    // 如果没有提供令牌，提示用户输入
    if (!token) {
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
      token = inputToken;
    }

    // 更新账号信息，添加令牌
    updateAccount(accountName, { githubToken: token });

    console.log(chalk.green(`✅ GitHub令牌已成功设置到账号 "${accountName}" (${account.githubUsername})`));
    console.log(chalk.blue('现在您可以使用GitHub API自动创建和删除仓库了'));
  } catch (error) {
    console.error(chalk.red('设置GitHub令牌时出错:'), error);
    process.exit(1);
  }
}
