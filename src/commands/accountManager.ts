import chalk from 'chalk';
import { getAccountNames, getDefaultAccountName, createAccount, deleteAccount, setDefaultAccount, getAccount, updateAccount } from '../utils/config';
import { confirm, confirmDangerousAction, input, selectAccount } from '../utils/interactive';
import {
  checkSshHostExists,
  generateSshConfigBlock,
  checkSshKeyExists,
  createSshKey,
  autoUpdateSshConfig,
  getSshKeyPath,
  readSshConfig,
  addHostToSshConfig,
  updateSshConfig,
} from '../utils/ssh';
import { GitHubAccount } from '../types';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

interface AccountManagerOptions {
  list?: boolean;
  create?: boolean;
  delete?: boolean;
  setDefault?: boolean;
  config?: boolean;
}

/**
 * 账号管理命令处理函数
 * @param accountName 账号名称
 * @param options 选项
 */
export async function accountManager(accountName?: string, options: AccountManagerOptions = {}): Promise<void> {
  try {
    // 如果指定了--list选项，列出所有账号
    if (options.list) {
      listAccounts();
      return;
    }

    // 如果指定了--create选项，创建新账号
    if (options.create) {
      await createNewAccount(accountName);
      return;
    }

    // 如果指定了--delete选项，删除账号
    if (options.delete) {
      if (!accountName) {
        console.error(chalk.red('请指定要删除的账号名称'));
        process.exit(1);
      }
      await deleteExistingAccount(accountName);
      return;
    }

    // 如果指定了--set-default选项，设置默认账号
    if (options.setDefault) {
      if (!accountName) {
        console.error(chalk.red('请指定要设置为默认的账号名称'));
        process.exit(1);
      }
      setDefaultExistingAccount(accountName);
      return;
    }

    // 如果指定了--config选项，配置账号信息
    if (options.config) {
      await configExistingAccount(accountName);
      return;
    }

    // 如果没有指定选项，显示交互式菜单
    await showInteractiveMenu(accountName);
  } catch (error) {
    console.error(chalk.red('账号管理时出错:'), error);
    process.exit(1);
  }
}

/**
 * 列出所有账号
 */
function listAccounts(): void {
  const accountNames = getAccountNames();
  const defaultAccountName = getDefaultAccountName();

  console.log(chalk.blue('已配置的GitHub账号:'));

  if (accountNames.length === 0) {
    console.log(chalk.yellow('  没有配置任何账号'));
    return;
  }

  for (const name of accountNames) {
    const { account } = getAccount(name);
    const isDefault = name === defaultAccountName ? chalk.green(' (默认)') : '';
    console.log(chalk.blue(`  ${name}${isDefault}: ${account.githubUsername} <${account.gitEmail}>`));
  }
}

/**
 * 创建新账号
 * @param suggestedName 建议的账号名称
 */
async function createNewAccount(suggestedName?: string): Promise<void> {
  const inquirer = (await import('inquirer')).default;

  // 获取账号名称
  let accountName = suggestedName;
  if (!accountName) {
    accountName = await input('请输入新账号的名称 (如: personal, work, etc.):', '', (input: string) => {
      if (!input.trim()) {
        return '账号名称不能为空';
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
        return '账号名称只能包含字母、数字、下划线和连字符';
      }
      const accountNames = getAccountNames();
      if (accountNames.includes(input)) {
        return `账号 "${input}" 已存在`;
      }
      return true;
    });
  }

  // 收集账号信息
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'githubUsername',
      message: 'GitHub用户名:',
      validate: (input: string) => (input.trim() ? true : 'GitHub用户名不能为空'),
    },
    {
      type: 'input',
      name: 'gitUsername',
      message: 'Git用户名:',
      validate: (input: string) => (input.trim() ? true : 'Git用户名不能为空'),
    },
    {
      type: 'input',
      name: 'gitEmail',
      message: 'Git邮箱:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Git邮箱不能为空';
        }
        if (!input.includes('@')) {
          return '请输入有效的邮箱地址';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'sshHostAlias',
      message: 'SSH主机别名:',
      default: `github.com-${accountName}`,
      validate: (input: string) => {
        if (!input.trim()) {
          return 'SSH主机别名不能为空';
        }
        if (checkSshHostExists(input)) {
          return `SSH主机别名 "${input}" 已存在于~/.ssh/config中`;
        }
        return true;
      },
    },
  ]);

  // 询问是否要设置GitHub令牌
  const { setToken } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'setToken',
      message: '是否要设置GitHub个人访问令牌 (PAT)?',
      default: true,
    },
  ]);

  if (setToken) {
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
  } else {
    answers.githubToken = '';
  }

  // 创建账号
  const accountData: GitHubAccount = {
    githubUsername: answers.githubUsername,
    gitUsername: answers.gitUsername,
    gitEmail: answers.gitEmail,
    sshHostAlias: answers.sshHostAlias,
    githubToken: answers.githubToken,
  };

  const success = createAccount(accountName, accountData);

  if (success) {
    // 询问是否要创建SSH密钥
    const keyPath = getSshKeyPath(accountData.sshHostAlias);
    const keyExists = checkSshKeyExists(keyPath);

    if (!keyExists) {
      const { createKey } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'createKey',
          message: `SSH密钥不存在，是否要创建新的SSH密钥? (${keyPath})`,
          default: true,
        },
      ]);

      if (createKey) {
        const { success, publicKey } = await createSshKey(accountData);

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
      } else {
        console.log(
          chalk.yellow(`
你需要手动生成SSH密钥:
  ssh-keygen -t rsa -b 4096 -C "${accountData.gitEmail}" -f "${keyPath}"

添加到GitHub:
  1. 复制公钥内容: cat ${keyPath}.pub
  2. 访问 https://github.com/settings/keys
  3. 点击 "New SSH key"
  4. 粘贴公钥内容并保存
        `)
        );
      }
    }

    // 询问是否自动更新SSH配置
    const { updateSshConfig } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'updateSshConfig',
        message: '是否自动更新SSH配置文件?',
        default: true,
      },
    ]);

    if (updateSshConfig) {
      const updated = autoUpdateSshConfig(accountData);
      if (updated) {
        console.log(chalk.green(`✅ SSH配置文件已成功更新`));
      }
    } else {
      // 生成SSH配置块
      const sshConfigBlock = generateSshConfigBlock(accountData);
      console.log(
        chalk.yellow(`
请手动将以下配置添加到你的SSH配置文件 (~/.ssh/config):
${sshConfigBlock}
      `)
      );
    }

    // 询问是否设置为默认账号
    const accountNames = getAccountNames();
    if (accountNames.length > 1) {
      const setAsDefault = await confirm('是否将此账号设置为默认账号?', false);
      if (setAsDefault) {
        setDefaultAccount(accountName);
      }
    }
  }
}

/**
 * 删除现有账号
 * @param accountName 账号名称
 */
async function deleteExistingAccount(accountName: string): Promise<void> {
  try {
    // 获取账号信息，用于后续可能的SSH配置和密钥删除
    const { account } = getAccount(accountName);

    const confirmDelete = await confirmDangerousAction(`你正在尝试删除账号 "${accountName}"。此操作将从配置文件中移除该账号的所有信息。`, `DELETE-${accountName}`);

    if (!confirmDelete) {
      console.log(chalk.yellow('已取消删除账号'));
      return;
    }

    // 询问是否删除SSH配置
    const sshHostAlias = account.sshHostAlias;
    const hostExists = checkSshHostExists(sshHostAlias);

    if (hostExists) {
      const inquirer = (await import('inquirer')).default;
      const { deleteSshConfig } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'deleteSshConfig',
          message: `是否从SSH配置文件中删除主机别名 "${sshHostAlias}" 的配置?`,
          default: false,
        },
      ]);

      if (deleteSshConfig) {
        // 读取当前SSH配置
        const sshConfig = readSshConfig();

        // 解析配置，获取所有Host块
        const hosts = parseSshConfig(sshConfig);

        // 删除指定的Host块
        if (hosts[sshHostAlias]) {
          delete hosts[sshHostAlias];

          // 重新组合配置
          const newConfig = Object.values(hosts).join('\n\n');

          // 更新SSH配置文件
          const success = updateSshConfig(newConfig);
          if (success) {
            console.log(chalk.green(`✅ 已从SSH配置文件中删除主机别名 "${sshHostAlias}"`));
          }
        }
      }
    }

    // 询问是否删除SSH密钥
    const keyPath = getSshKeyPath(sshHostAlias);
    const pubKeyPath = `${keyPath}.pub`;
    const keyExists = checkSshKeyExists(keyPath);

    if (keyExists) {
      const inquirer = (await import('inquirer')).default;
      const { deleteSshKey } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'deleteSshKey',
          message: `是否删除SSH密钥文件? (${keyPath})`,
          default: false,
        },
      ]);

      if (deleteSshKey) {
        try {
          // 删除私钥和公钥
          if (fs.existsSync(keyPath)) {
            fs.unlinkSync(keyPath);
          }
          if (fs.existsSync(pubKeyPath)) {
            fs.unlinkSync(pubKeyPath);
          }
          console.log(chalk.green(`✅ 已删除SSH密钥文件`));
        } catch (error) {
          console.error(chalk.red('删除SSH密钥文件时出错:'), error);
        }
      }
    }

    // 删除账号
    deleteAccount(accountName);
    console.log(chalk.green(`✅ 账号 "${accountName}" 已成功删除`));
  } catch (error) {
    console.error(chalk.red('删除账号时出错:'), error);
    process.exit(1);
  }
}

/**
 * 解析SSH配置文件，提取Host块
 * @param config SSH配置文件内容
 * @returns 解析后的Host块对象，键为Host名称，值为配置内容
 */
function parseSshConfig(config: string): Record<string, string> {
  const hosts: Record<string, string> = {};

  if (!config) return hosts;

  // 使用正则表达式匹配Host块
  const hostBlocks = config.split(/\n(?=Host\s+)/);

  for (const block of hostBlocks) {
    const hostMatch = block.match(/^Host\s+(.+?)(?:\n|$)/);
    if (hostMatch) {
      const hostName = hostMatch[1].trim();
      hosts[hostName] = block;
    }
  }

  return hosts;
}

/**
 * 设置默认账号
 * @param accountName 账号名称
 */
function setDefaultExistingAccount(accountName: string): void {
  setDefaultAccount(accountName);
}

/**
 * 配置现有账号信息
 * @param accountName 账号名称
 */
async function configExistingAccount(accountName?: string): Promise<void> {
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

/**
 * 显示交互式菜单
 * @param accountName 账号名称
 */
async function showInteractiveMenu(accountName?: string): Promise<void> {
  const inquirer = (await import('inquirer')).default;

  // 列出所有账号
  listAccounts();

  // 显示菜单
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '选择要执行的操作:',
      choices: [
        { name: '创建新账号', value: 'create' },
        { name: '配置现有账号', value: 'config' },
        { name: '删除账号', value: 'delete' },
        { name: '设置默认账号', value: 'setDefault' },
        { name: '查看SSH配置', value: 'viewSsh' },
        { name: '取消', value: 'cancel' },
      ],
    },
  ]);

  if (action === 'cancel') {
    console.log(chalk.yellow('操作已取消'));
    return;
  }

  if (action === 'create') {
    await createNewAccount();
    return;
  }

  if (action === 'config') {
    const accountNames = getAccountNames();
    if (accountNames.length === 0) {
      console.log(chalk.yellow('没有配置任何账号'));
      return;
    }

    const { selectedAccount } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedAccount',
        message: '选择要配置的账号:',
        choices: accountNames,
      },
    ]);

    await configExistingAccount(selectedAccount);
    return;
  }

  if (action === 'delete') {
    const accountNames = getAccountNames();
    if (accountNames.length === 0) {
      console.log(chalk.yellow('没有配置任何账号'));
      return;
    }

    const { selectedAccount } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedAccount',
        message: '选择要删除的账号:',
        choices: accountNames,
      },
    ]);

    await deleteExistingAccount(selectedAccount);
    return;
  }

  if (action === 'setDefault') {
    const accountNames = getAccountNames();
    if (accountNames.length === 0) {
      console.log(chalk.yellow('没有配置任何账号'));
      return;
    }

    const { selectedAccount } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedAccount',
        message: '选择要设置为默认的账号:',
        choices: accountNames,
      },
    ]);

    setDefaultExistingAccount(selectedAccount);
    return;
  }

  if (action === 'viewSsh') {
    const sshConfig = readSshConfig();

    if (!sshConfig) {
      console.log(chalk.yellow('SSH配置文件不存在或为空'));
      return;
    }

    console.log(chalk.blue('SSH配置文件内容:'));
    console.log(sshConfig);
    return;
  }
}
