// GitHub账号配置接口
export interface GitHubAccount {
  githubUsername: string; // GitHub用户名
  gitUsername: string; // Git提交显示的用户名
  gitEmail: string; // Git提交显示的邮箱
  sshHostAlias: string; // SSH配置中的Host别名
}

// 配置文件接口
export interface Config {
  accounts: Record<string, GitHubAccount>;
  defaultAccount: string;
}

// 仓库信息接口
export interface RepoInfo {
  name: string; // 仓库名称
  owner: string; // 仓库所有者
  fullName: string; // 完整名称 (owner/name)
  sshUrl: string; // SSH URL
  httpsUrl: string; // HTTPS URL
  exists: boolean; // 仓库是否存在
}
