import chalk from 'chalk';
import { getAccount, updateAccount, readConfig } from '../utils/config';
import { selectAccount } from '../utils/interactive';

/**
 * 配置账号信息命令处理函数
 * @param accountName 账号名称
 */
export async function configAccount(accountName?: string): Promise<void> {
  try {
    // 如果没有提供账号名称，让用户选择一个账号
    if (!accountName) {
      accountName = await selectAccount('选择要配置的GitHub账号:');
    }

    // 获取账号信息
    const { account } = getAccount(accountName);

    // 提示用户输入新的账号信息
    const inquirer = (await import('inquirer')).default;
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '选择要执行的操作:',
        choices: [
          { name: '更新账号信息', value: 'update' },
          { name: '查看账号信息', value: 'view' },
          { name: '设置GitHub令牌', value: 'token' },
          { name: '取消', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'cancel') {
      console.log(chalk.yellow('操作已取消'));
      return;
    }

    if (action === 'view') {
      // 显示账号信息，但隐藏令牌的具体内容
      const tokenDisplay = account.githubToken ? '******' : '未设置';
      console.log(chalk.blue(`账号信息 - ${accountName}:`));
      console.log(chalk.blue(`GitHub用户名: ${account.githubUsername}`));
      console.log(chalk.blue(`Git用户名: ${account.gitUsername}`));
      console.log(chalk.blue(`Git邮箱: ${account.gitEmail}`));
      console.log(chalk.blue(`SSH主机别名: ${account.sshHostAlias}`));
      console.log(chalk.blue(`GitHub令牌: ${tokenDisplay}`));
      return;
    }

    if (action === 'token') {
      const { token } = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
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
      updateAccount(accountName, { githubToken: token });
      console.log(chalk.green(`✅ GitHub令牌已成功设置到账号 "${accountName}" (${account.githubUsername})`));
      return;
    }

    // 更新账号信息
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'githubUsername',
        message: 'GitHub用户名:',
        default: account.githubUsername,
      },
      {
        type: 'input',
        name: 'gitUsername',
        message: 'Git用户名:',
        default: account.gitUsername,
      },
      {
        type: 'input',
        name: 'gitEmail',
        message: 'Git邮箱:',
        default: account.gitEmail,
      },
      {
        type: 'input',
        name: 'sshHostAlias',
        message: 'SSH主机别名:',
        default: account.sshHostAlias,
      },
    ]);

    // 询问是否要更新令牌
    const { updateToken } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'updateToken',
        message: '是否要更新GitHub令牌?',
        default: false,
      },
    ]);

    if (updateToken) {
      const { token } = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: '请输入GitHub个人访问令牌 (PAT):',
          validate: (input: string) => {
            if (!input.trim()) {
              return '令牌不能为空';
            }
            return true;
          },
        },
      ]);
      answers.githubToken = token;
    } else if (account.githubToken) {
      // 保留原有令牌
      answers.githubToken = account.githubToken;
    }

    // 更新账号信息
    updateAccount(accountName, answers);

    console.log(chalk.green(`✅ 账号 "${accountName}" 信息已成功更新`));
  } catch (error) {
    console.error(chalk.red('配置账号信息时出错:'), error);
    process.exit(1);
  }
}
