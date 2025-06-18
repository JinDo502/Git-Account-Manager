# GitHub 账号管理 CLI (`gh-manager`)

`gh-manager` 是一个强大的命令行工具，旨在帮助开发者更方便地管理多个 GitHub 账号及其关联的 Git 仓库。它自动化了账号切换、仓库迁移和 Git 用户信息配置等繁琐任务。

## 功能特性

- **账号管理**：支持创建、删除、配置任意数量的 GitHub 账号，并可设置默认账号。
- **SSH 配置**：自动生成 SSH 密钥和更新 SSH 配置文件，简化多账号的 SSH 设置。
- **账号切换**：快速将当前 Git 仓库的远程 URL 和 Git 用户信息切换到预配置的 GitHub 账号。
- **仓库迁移**：将本地仓库从一个 GitHub 账号迁移到另一个，包括在新账号下创建远程仓库并推送所有代码。支持检测目标仓库是否存在，并提供删除原远程仓库的选项（高风险操作，需多次确认）。
- **自动 Git 配置**：在切换或迁移过程中，自动更新本地仓库的 `user.name` 和 `user.email`。
- **交互式界面**：通过命令行提示引导用户完成操作。
- **仓库初始化**：在非 Git 仓库目录中使用时，可选择初始化 Git 仓库并配置远程仓库。
- **仓库可见性选择**：创建仓库时可选择公开或私有仓库。
- **仓库名称自定义**：支持自定义仓库名称，不限于当前目录名。

## 前置条件

在安装和使用 `gh-manager` 之前，请确保你已满足以下条件：

1.  **Node.js (LTS 版本)**：确保你的系统已安装 Node.js。
2.  **npm (或 yarn/pnpm)**：Node.js 包管理器，通常随 Node.js 一起安装。
3.  **GitHub CLI (`gh`)**：
    - `gh-manager` 依赖 GitHub CLI 进行远程仓库操作（如创建、检查、删除）。
    - **安装 `gh`**：请访问 [GitHub CLI 官方文档](https://cli.github.com/) 获取安装指南。
    - **认证 `gh`**：你需要使用 **SSH 协议**登录 GitHub CLI：
      ```bash
      # 使用标准的github.com主机名登录
      gh auth login -h github.com -p ssh
      ```
      注意：不需要为每个 SSH 别名单独登录，工具会自动处理。
4.  **SSH 密钥配置**：工具可以自动为你创建 SSH 密钥并更新 SSH 配置文件。

## 安装

1.  **克隆仓库**：

    ```bash
    git clone https://github.com/your-username/gh-manager.git
    cd gh-manager
    ```

    或手动创建项目目录并放置文件。

2.  **安装依赖**：

    ```bash
    npm install
    ```

3.  **编译 TypeScript**：

    ```bash
    npm run build
    ```

4.  **链接到全局命令 (可选但推荐)**：
    ```bash
    npm link
    ```
    这将允许你在任何目录直接运行 `gh-manager` 命令。

## 配置 (`~/.github_account_manager_ts.json`)

首次运行 `gh-manager` 任何命令时，如果配置文件不存在，它将在你的用户主目录 (`~`) 下自动创建一个名为 `.github_account_manager_ts.json` 的模板文件。

你可以使用 `gh-manager account create` 命令交互式地创建和配置新账号，或者直接编辑配置文件：

```json
{
  "accounts": {
    "personal": {
      "githubUsername": "YourGitHubUsername", // 你的 GitHub 网站用户名
      "gitUsername": "Your Name", // Git 提交中显示的姓名
      "gitEmail": "your.email@example.com", // Git 提交中显示的邮箱
      "sshHostAlias": "github.com-personal", // 你的 ~/.ssh/config 中的别名
      "githubToken": "your_github_token" // 你的 GitHub 个人访问令牌(PAT)
    }
  },
  "defaultAccount": "personal" // 默认选择的账号别名
}
```

### 关于 GitHub 个人访问令牌(PAT)

为了自动创建和管理 GitHub 仓库，`gh-manager` 需要使用 GitHub 个人访问令牌(PAT)。请按照以下步骤获取令牌：

1. 登录你的 GitHub 账号
2. 点击右上角头像 → Settings → Developer settings → Personal access tokens → Tokens (classic)
3. 点击 "Generate new token" → "Generate new token (classic)"
4. 为令牌提供一个描述性名称，如 "gh-manager CLI"
5. 选择令牌的有效期限（建议 30 天或更短）
6. 选择以下**最小必要权限**：
   - `repo` (仓库权限，用于创建和管理仓库)
     - `repo:status` (访问提交状态)
     - `repo_deployment` (访问部署状态)
     - `public_repo` (仅公开仓库，如果只需要公开仓库)
     - `repo:invite` (接受仓库邀请)
   - `delete_repo` (如果需要使用删除仓库功能)
7. 点击 "Generate token" 按钮
8. 复制生成的令牌并保存到配置文件中

**安全提示**：

- GitHub 个人访问令牌与密码具有相同的权限，请妥善保管
- 配置文件存储在你的本地计算机上，不会被上传到任何地方
- 建议为令牌设置有效期限，过期后重新生成
- 仅授予必要的最小权限，如果不需要删除仓库功能，可以不勾选 `delete_repo`

**自动令牌配置**：如果你没有在配置文件中设置令牌，在需要使用令牌的操作（如创建或删除仓库）时，工具会提示你输入令牌，并自动保存到配置文件中。你也可以使用以下命令随时配置令牌：

```bash
# 交互式配置账号信息（包括令牌）
gh-manager config

# 为指定账号配置信息
gh-manager config personal
```

## 使用方法

### 账号管理

管理 GitHub 账号，包括创建、删除、列出和设置默认账号：

```bash
# 交互式管理账号
gh-manager account

# 列出所有账号
gh-manager account --list

# 创建新账号
gh-manager account --create [账号名称]

# 删除账号
gh-manager account --delete 账号名称

# 设置默认账号
gh-manager account --set-default 账号名称
```

创建账号时，工具会自动：

1. 询问 GitHub 用户名、Git 用户名、邮箱和 SSH 主机别名
2. 提供创建 SSH 密钥的选项
3. 自动更新 SSH 配置文件
4. 显示公钥内容，方便添加到 GitHub 账号

### 切换账号

将当前 Git 仓库切换到指定的 GitHub 账号：

```bash
# 交互式选择账号
gh-manager switch

# 直接指定账号
gh-manager switch personal
gh-manager switch work
```

这将：

1. 更新当前仓库的 Git 配置（用户名和邮箱）
2. 询问是否自定义仓库名称（默认使用当前目录名）
3. 询问是否创建远程仓库，如果选择创建，会进一步询问：
   - 是否将仓库设置为公开(Public)仓库（默认为私有）
   - 是否设置上游追踪分支
   - 是否创建初始提交并推送代码
4. 更新远程 URL 以使用指定账号的 SSH 别名

如果当前目录不是 Git 仓库，工具会询问是否要初始化仓库，并可选择在 GitHub 上创建远程仓库。

### 迁移仓库

将仓库从一个 GitHub 账号迁移到另一个：

```bash
# 交互式选择源账号和目标账号
gh-manager migrate

# 直接指定源账号和目标账号
gh-manager migrate personal work

# 迁移后删除源仓库（需多次确认）
gh-manager migrate personal work --delete-source
```

这将：

1. 询问是否自定义仓库名称（默认使用当前目录名）
2. 在目标账号中创建同名仓库（如果不存在）
3. 询问是否将仓库设置为公开(Public)仓库（默认为私有）
4. 更新 Git 配置为目标账号
5. 询问是否设置上游追踪分支
6. 推送所有代码到目标账号
7. 可选：删除源账号中的仓库（需多次确认）

如果当前目录不是 Git 仓库，工具会询问是否要初始化仓库，并在目标账号中创建远程仓库。

### 在新项目中使用

在任何目录中运行 `gh-manager switch` 或 `gh-manager migrate`，工具会检测到当前不是 Git 仓库，并提供以下选项：

1. 初始化 Git 仓库
2. 配置 Git 用户信息
3. 创建远程 GitHub 仓库
4. 创建初始提交并推送

这使得从零开始创建新项目并关联到特定 GitHub 账号变得非常简单。

## 注意事项

- **数据安全**：在执行删除源仓库等高风险操作前，工具会要求多次确认。
- **权限要求**：确保你已正确配置 SSH 密钥并授权 GitHub CLI。
- **配置文件**：如果遇到问题，请检查 `~/.github_account_manager_ts.json` 配置是否正确。
- **SSH 配置**：工具会自动管理 SSH 配置，但在某些情况下可能需要手动调整。
