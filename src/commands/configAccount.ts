import chalk from 'chalk';
import { getAccount, updateAccount } from '../utils/config';
import { selectAccount } from '../utils/interactive';
import { generateSshConfigBlock, checkSshHostExists, readSshConfig, addHostToSshConfig, createSshKey, getSshKeyPath, checkSshKeyExists } from '../utils/ssh';

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
          { name: '管理SSH配置', value: 'ssh' },
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

    if (action === 'ssh') {
      await manageSshConfig(accountName, account);
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
        validate: (input: string) => {
          if (!input.trim()) {
            return 'SSH主机别名不能为空';
          }
          if (input !== account.sshHostAlias && checkSshHostExists(input)) {
            return `SSH主机别名 "${input}" 已存在于~/.ssh/config中`;
          }
          return true;
        },
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

    // 如果SSH主机别名已更改，提示用户更新SSH配置
    if (answers.sshHostAlias !== account.sshHostAlias) {
      console.log(
        chalk.yellow(`
注意: SSH主机别名已从 "${account.sshHostAlias}" 更改为 "${answers.sshHostAlias}"。
你需要相应地更新SSH配置文件 (~/.ssh/config)。
      `)
      );

      // 询问是否要查看SSH配置
      const { viewSsh } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'viewSsh',
          message: '是否要查看和管理SSH配置?',
          default: true,
        },
      ]);

      if (viewSsh) {
        await manageSshConfig(accountName, { ...account, ...answers });
      }
    }
  } catch (error) {
    console.error(chalk.red('配置账号信息时出错:'), error);
    process.exit(1);
  }
}

/**
 * 管理SSH配置
 * @param accountName 账号名称
 * @param account 账号信息
 */
async function manageSshConfig(accountName: string, account: any): Promise<void> {
  const inquirer = (await import('inquirer')).default;

  // 读取当前SSH配置
  const sshConfig = readSshConfig();
  const hostExists = checkSshHostExists(account.sshHostAlias);

  console.log(chalk.blue(`SSH配置管理 - ${accountName} (${account.githubUsername})`));

  // 检查SSH密钥是否存在
  const keyPath = getSshKeyPath(account.sshHostAlias);
  const keyExists = checkSshKeyExists(keyPath);

  if (!keyExists) {
    console.log(chalk.yellow(`⚠️  SSH密钥 "${keyPath}" 不存在`));

    // 询问是否要创建SSH密钥
    const { createKey } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createKey',
        message: '是否要创建新的SSH密钥?',
        default: true,
      },
    ]);

    if (createKey) {
      const { success, publicKey } = await createSshKey(account);

      if (success) {
        console.log(chalk.green(`✅ SSH密钥已成功创建`));
        console.log(
          chalk.yellow(`
以下是你的SSH公钥，请将其添加到GitHub账号:
${publicKey}

添加到GitHub:
1. 复制上面的公钥内容
2. 访问 https://github.com/settings/keys
3. 点击 "New SSH key"
4. 粘贴公钥内容并保存
        `)
        );
      }
    }
  } else {
    console.log(chalk.green(`✅ SSH密钥已存在: ${keyPath}`));
  }

  if (hostExists) {
    console.log(chalk.green(`✅ SSH主机别名 "${account.sshHostAlias}" 已存在于配置文件中`));
  } else {
    console.log(chalk.yellow(`⚠️  SSH主机别名 "${account.sshHostAlias}" 不存在于配置文件中`));

    // 生成SSH配置块
    const sshConfigBlock = generateSshConfigBlock(account);
    console.log(chalk.blue(`建议的SSH配置块:`));
    console.log(sshConfigBlock);

    // 询问是否要添加到SSH配置
    const { addToConfig } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addToConfig',
        message: '是否要将此配置添加到SSH配置文件?',
        default: true,
      },
    ]);

    if (addToConfig) {
      const success = addHostToSshConfig(sshConfigBlock);
      if (success) {
        console.log(chalk.green(`✅ SSH配置已成功更新`));
      }
    } else {
      console.log(
        chalk.yellow(`
请手动将以下配置添加到你的SSH配置文件 (~/.ssh/config):
${sshConfigBlock}
      `)
      );
    }
  }

  // 显示完整的SSH配置
  const { viewFullConfig } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'viewFullConfig',
      message: '是否要查看完整的SSH配置文件?',
      default: false,
    },
  ]);

  if (viewFullConfig) {
    console.log(chalk.blue('SSH配置文件内容:'));
    console.log(sshConfig);
  }
}
