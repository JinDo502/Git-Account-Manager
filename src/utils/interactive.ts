import inquirer from 'inquirer';
import chalk from 'chalk';
import { getAccountNames } from './config';

/**
 * 选择GitHub账号
 * @param message 提示消息
 * @param defaultAccount 默认账号
 * @returns 选择的账号名称
 */
export async function selectAccount(message: string, defaultAccount?: string): Promise<string> {
  const accountNames = getAccountNames();

  if (accountNames.length === 0) {
    console.error(chalk.red('没有配置GitHub账号。请编辑配置文件添加账号。'));
    process.exit(1);
  }

  if (defaultAccount && accountNames.includes(defaultAccount)) {
    return defaultAccount;
  }

  const { account } = await inquirer.prompt([
    {
      type: 'list',
      name: 'account',
      message,
      choices: accountNames,
    },
  ]);

  return account;
}

/**
 * 确认操作
 * @param message 提示消息
 * @param defaultValue 默认值
 * @returns 是否确认
 */
export async function confirm(message: string, defaultValue: boolean = false): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);

  return confirmed;
}

/**
 * 输入文本
 * @param message 提示消息
 * @param defaultValue 默认值
 * @param validate 验证函数
 * @returns 输入的文本
 */
export async function input(message: string, defaultValue?: string, validate?: (input: string) => boolean | string | Promise<boolean | string>): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue,
      validate,
    },
  ]);

  return value;
}

/**
 * 多次确认高风险操作
 * @param message 提示消息
 * @param confirmationText 确认文本
 * @returns 是否确认
 */
export async function confirmDangerousAction(message: string, confirmationText: string): Promise<boolean> {
  console.log(chalk.red.bold('⚠️  警告: 这是一个高风险操作!'));
  console.log(chalk.yellow(message));

  const firstConfirm = await confirm('你确定要继续吗?', false);
  if (!firstConfirm) return false;

  console.log(chalk.red.bold('⚠️  最后警告: 此操作不可逆!'));

  const { text } = await inquirer.prompt([
    {
      type: 'input',
      name: 'text',
      message: `请输入 "${confirmationText}" 以确认:`,
      validate: (input: string) => input === confirmationText || `必须输入 "${confirmationText}" 才能继续`,
    },
  ]);

  return text === confirmationText;
}
