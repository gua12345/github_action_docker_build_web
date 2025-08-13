addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const GITHUB_TOKEN = '你的github PAT';
const REPO_OWNER = '你的github用户名';
const REPO_NAME = 'github_action_docker_build_web';
const DOCKER_USERNAME = '你的DOCKER HUB用户名';
const PASSWORD = '你的路径密码'; // 设置您的密码

const GITHUB_HEADERS = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'Cloudflare-Worker-Docker-Builder'
};


function mapStatus(status, conclusion) {
  if (status === 'completed') {
    if (conclusion === 'success') {
      return { text: '构建成功', class: 'status-success' };
    } else {
      return { text: '构建失败', class: 'status-failure' };
    }
  } else if (status === 'in_progress' || status === 'queued') {
    return { text: '在队列中', class: 'status-in-progress' };
  } else {
    return { text: '未知状态', class: 'status-unknown' };
  }
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path !== `/${PASSWORD}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (request.method === 'POST') {
    try {
      const contentType = request.headers.get('content-type') || '';
      let formData;
      if (contentType.includes('multipart/form-data')) {
        formData = await request.formData();
      } else {
        const text = await request.text();
        formData = new URLSearchParams(text);
      }
      const getConfigValue = (key) => {
        const value = formData.get(key);
        if (!value) throw new Error(`Missing required field: ${key}`);
        return value;
      };
      const architectures = formData.getAll('architectures');
      if (architectures.length === 0) throw new Error('Must select at least one architecture');

      const configContent =
        `GITHUB_REPO=${getConfigValue('githubRepo')}\n` +
        `BRANCH=${getConfigValue('branch')}\n` +
        `DOCKER_USERNAME=${getConfigValue('dockerUsername')}\n` +
        `DOCKER_REPO_NAME=${getConfigValue('dockerRepoName')}\n` +
        `DOCKER_TAG=${getConfigValue('dockerTag')}\n` +
        `ARCHITECTURES=${architectures.join(',')}\n` +
        `DOCKERFILE_AMD64=${getConfigValue('dockerfileAmd64')}\n` +
        `DOCKERFILE_ARM64=${getConfigValue('dockerfileArm64')}`;

      await updateConfigFile(configContent);

      const inputs = { config_content: configContent };
      await triggerWorkflow(inputs);

      return new Response('Build triggered successfully!', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    } catch (error) {
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }

  const workflows = await getWorkflowHistory();

  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <title>Docker构建系统</title>
      <style>
        body {
          margin: 0;
          padding: 20px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .container {
          display: flex;
          gap: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .sidebar {
          width: 300px;
          border-radius: 10px;
          padding: 20px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .content {
          flex: 1;
          border-radius: 10px;
          padding: 20px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          height: 80vh;
          overflow-y: auto;
        }
        h1 {
          text-align: center;
          padding-bottom: 10px;
          font-size: 24px;
          font-weight: bold;
        }
        .workflow-item {
          border-radius: 5px;
          padding: 15px;
          margin-bottom: 10px;
          transition: transform 0.2s;
          font-size: 16px;
          position: relative;
        }
        .workflow-item:hover {
          transform: translateX(10px);
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .workflow-detail {
          padding: 15px;
          margin-top: 10px;
          border-radius: 5px;
          display: none;
          font-size: 14px;
        }
        .toggle-detail-btn {
          position: absolute;
          right: 15px;
          top: 15px;
          background: #a8e6cf;
          color: #2e8b57;
          border: none;
          padding: 5px 10px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
        }
        button {
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
          transition: background 0.3s;
        }
        input, select {
          width: 100%;
          padding: 8px;
          margin: 5px 0;
          border-radius: 5px;
          font-size: 14px;
        }
        .header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          padding: 10px;
          text-align: center;
          font-size: 24px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          z-index: 1000;
        }
        .checkbox-group {
          margin: 5px 0;
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .checkbox-container {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          border-radius: 5px;
        }
        .checkbox-container input[type="checkbox"] {
          margin: 0 5px 0 0;
          width: auto;
        }
        .form-description {
          margin-bottom: 5px;
          font-size: 14px;
        }
        .toast {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          padding: 10px 20px;
          border-radius: 5px;
          z-index: 10000;
        }
        .copy-command {
          padding: 5px 10px;
          border-radius: 5px;
          font-family: monospace;
          display: inline-block;
          cursor: pointer;
          text-decoration: underline;
        }

        /* Light mode */
        body.light {
          background: #e0f7e9;
          color: #333;
        }
        .sidebar.light, .content.light {
          background: #ffffff;
          border: 2px solid #a8e6cf;
        }
        h1.light {
          color: #2e8b57;
          border-bottom: 2px solid #a8e6cf;
        }
        .workflow-item.light {
          background: #f5f5f5;
          border: 1px solid #a8e6cf;
        }
        .workflow-detail.light {
          background: #ffffff;
          border: 1px solid #a8e6cf;
        }
        button.light, .toggle-detail-btn.light {
          background: #a8e6cf;
          color: #2e8b57;
        }
        button.light:hover, .toggle-detail-btn.light:hover {
          background: #c4f0d5;
        }
        input.light, select.light {
          border: 1px solid #a8e6cf;
          background: #ffffff;
          color: #333;
        }
        .header.light {
          background: #a8e6cf;
          color: #2e8b57;
        }
        .checkbox-container.light {
          border: 1px solid #a8e6cf;
          background: #ffffff;
        }
        .form-description.light {
          color: #666;
        }
        .toast.light {
          background: #2e8b57;
          color: white;
        }
        .copy-command.light {
          background: #f5f5f5;
          color: #007bff;
        }

        /* Dark mode */
        body.dark {
          background: #121212;
          color: #e0e0e0;
        }
        .sidebar.dark, .content.dark {
          background: #1e1e1e;
          border: 2px solid #333;
        }
        h1.dark {
          color: #a8e6cf;
          border-bottom: 2px solid #333;
        }
        .workflow-item.dark {
          background: #2a2a2a;
          border: 1px solid #333;
        }
        .workflow-detail.dark {
          background: #1e1e1e;
          border: 1px solid #333;
        }
        button.dark, .toggle-detail-btn.dark {
          background: #333;
          color: #a8e6cf;
        }
        button.dark:hover, .toggle-detail-btn.dark:hover {
          background: #444;
        }
        input.dark, select.dark {
          border: 1px solid #333;
          background: #2a2a2a;
          color: #e0e0e0;
        }
        .header.dark {
          background: #1e1e1e;
          color: #a8e6cf;
        }
        .checkbox-container.dark {
          border: 1px solid #333;
          background: #2a2a2a;
        }
        .form-description.dark {
          color: #999;
        }
        .toast.dark {
          background: #a8e6cf;
          color: #121212;
        }
        .copy-command.dark {
          background: #2a2a2a;
          color: #a8e6cf;
        }

        /* 状态颜色定义 */
        .workflow-item.light .status-success {
          color: green;
        }
        .workflow-item.light .status-failure {
          color: red;
        }
        .workflow-item.light .status-in-progress {
          color: orange;
        }
        .workflow-item.light .status-unknown {
          color: darkpurple;
        }
        .workflow-item.dark .status-success {
          color: lightgreen;
        }
        .workflow-item.dark .status-failure {
          color: salmon;
        }
        .workflow-item.dark .status-in-progress {
          color: yellow;
        }
        .workflow-item.dark .status-unknown {
          color: plum;
        }
      </style>
    </head>
    <body class="light">
    <h1>
    <a href="https://github.com/gua12345/github_action_docker_build_web">
      <img src="https://github.com/favicon.ico" alt="GitHub" style="width:20px;height:20px; vertical-align:middle; margin-right:5px;">
    </a>
    Docker构建系统
    </h1>
      <div class="container">
        <div class="sidebar light">
          <h1 class="light">构建配置</h1>
          <form id="build-form" method="POST">
            <div class="form-description light">GitHub仓库URL：需要构建的GitHub仓库地址.git结尾</div>
            <input class="light" type="text" name="githubRepo" value="" placeholder="GitHub仓库URL" required>
            <div class="form-description light">分支：GitHub仓库的分支</div>
            <input class="light" type="text" name="branch" value="main" placeholder="分支" required>
            <div class="form-description light">Docker仓库名：Docker Hub上的仓库名称</div>
            <input class="light" type="text" name="dockerRepoName" value="" placeholder="Docker仓库名" required>
            <div class="form-description light">Docker用户名：Docker Hub的用户名</div>
            <input class="light" type="text" name="dockerUsername" value="${DOCKER_USERNAME}" placeholder="Docker用户名" required>
            <div class="form-description light">Docker标签：构建的Docker镜像标签</div>
            <input class="light" type="text" name="dockerTag" value="latest" placeholder="Docker标签" required>
            <div class="form-description light">架构：镜像的架构</div>
            <div class="checkbox-group">
              <div class="checkbox-container light">
                <input type="checkbox" name="architectures" value="linux/amd64" checked> linux/amd64
              </div>
              <div class="checkbox-container light">
                <input type="checkbox" name="architectures" value="linux/arm64" checked> linux/arm64
              </div>
            </div>
            <div class="form-description light">AMD64 Dockerfile：AMD64架构的Dockerfile路径</div>
            <input class="light" type="text" name="dockerfileAmd64" value="Dockerfile" placeholder="AMD64 Dockerfile" required>
            <div class="form-description light">ARM64 Dockerfile：ARM64架构的Dockerfile路径</div>
            <input class="light" type="text" name="dockerfileArm64" value="Dockerfile" placeholder="ARM64 Dockerfile" required>
            <button class="light" type="submit" style="width: 100%">立即构建</button>
          </form>
        </div>
        <div class="content light">
          <h1 class="light">构建历史</h1>
          <div id="workflow-list">
            ${await Promise.all(workflows.map(async run => {
              const config = await getConfigContent(run.id);
              const status = mapStatus(run.status, run.conclusion);
              const pullCommand = config ? `docker pull ${config.DOCKER_USERNAME}/${config.DOCKER_REPO_NAME}:${config.DOCKER_TAG}` : 'N/A';
              return `
                <div class="workflow-item light">
                  <button class="toggle-detail-btn light" style="right: 100px;" onclick="rebuildWithConfig(this, '${btoa(JSON.stringify(config))}')">再次构建</button>
                  <button class="toggle-detail-btn light" onclick="toggleDetail(this)">查看详情</button>
                  <script>console.log('Adding rebuild button for run ID: ${run.id}')</script>
                  <div>拉取命令：
                    <span class="copy-command light" onclick="copyToClipboard(event, this)">${pullCommand}</span>
                  </div>
                  <div>构建时间：${new Date(run.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</div>
                  <div>状态：<span class="${status.class}">${status.text}</span></div>
                  <div><a href="${run.html_url}" target="_blank">查看构建详情</a></div>
                  <div class="workflow-detail light">
                    配置信息：<br>
                    <pre>${config ? JSON.stringify(config, null, 2) : 'No configuration details available'}</pre>
                  </div>
                </div>
              `;
            })).then(html => html.join(''))}
          </div>
        </div>
      </div>
      <script>
        document.getElementById('build-form').addEventListener('submit', async function(event) {
          event.preventDefault();
          const formData = new FormData(this);
          const passwordPath = window.location.pathname;
          try {
            const response = await fetch(passwordPath, {
              method: 'POST',
              body: formData
            });
            if (response.ok) {
              showToast('构建已成功触发！');
              setTimeout(() => location.reload(), 3000);
            } else {
              const errorText = await response.text();
              showToast('错误：' + errorText);
            }
          } catch (error) {
            showToast('错误：' + error.message);
          }
        });

        function showToast(message) {
          const toast = document.createElement('div');
          toast.className = 'toast light';
          toast.innerText = message;
          document.body.appendChild(toast);
          setTimeout(() => document.body.removeChild(toast), 3000);
        }

        function toggleDetail(button) {
          const detail = button.parentElement.querySelector('.workflow-detail');
          detail.style.display = detail.style.display === 'block' ? 'none' : 'block';
        }

        function copyToClipboard(event, element) {
          event.stopPropagation();
          const text = element.innerText;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
              showToast('命令已复制到剪贴板！');
            }).catch(() => showToast('复制失败，请手动复制。'));
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            try {
              document.execCommand('copy');
              showToast('命令已复制到剪贴板！');
            } catch {
              showToast('复制失败，请手动复制。');
            }
            document.body.removeChild(textarea);
          }
        }

        function rebuildWithConfig(button, encodedConfig) {
          const config = JSON.parse(atob(encodedConfig));
          const form = document.getElementById('build-form');

          form.elements['githubRepo'].value = config.GITHUB_REPO || '';
          form.elements['branch'].value = config.BRANCH || 'main';
          form.elements['dockerRepoName'].value = config.DOCKER_REPO_NAME || '';
          form.elements['dockerUsername'].value = config.DOCKER_USERNAME || '';
          form.elements['dockerTag'].value = config.DOCKER_TAG || 'latest';
          form.elements['dockerfileAmd64'].value = config.DOCKERFILE_AMD64 || 'Dockerfile';
          form.elements['dockerfileArm64'].value = config.DOCKERFILE_ARM64 || 'Dockerfile';

          // 处理 architectures 多选框
          const architectures = config.ARCHITECTURES ? config.ARCHITECTURES.split(',') : [];
          form.querySelectorAll('input[name="architectures"]').forEach(checkbox => {
            checkbox.checked = architectures.includes(checkbox.value);
          });

          showToast('构建配置已填充！');
        }

        const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
        function setTheme() {
          const isDark = themeMedia.matches;
          document.body.classList.toggle('dark', isDark);
          document.body.classList.toggle('light', !isDark);
          document.querySelectorAll('.sidebar, .content, h1, .workflow-item, .workflow-detail, button, input, select, .header, .checkbox-container, .form-description, .toast, .copy-command, .toggle-detail-btn').forEach(el => {
            el.classList.toggle('dark', isDark);
            el.classList.toggle('light', !isDark);
          });
        }
        setTheme();
        themeMedia.addEventListener('change', setTheme);
      </script>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' }
  });
}

/**
 * 更新 GitHub 仓库中的配置文件
 * @param {string} content - 配置文件内容
 */
async function updateConfigFile(content) {
  const filePath = 'config.env';
  const branch = 'main';
  const getExistingFile = async () => {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${branch}`,
        { headers: GITHUB_HEADERS }
      );
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  const existingFile = await getExistingFile();
  const sha = existingFile?.sha;
  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: GITHUB_HEADERS,
      body: JSON.stringify({
        message: 'Update config.env',
        content: btoa(content),
        branch: branch,
        sha: sha
      })
    }
  );
  if (!response.ok) throw new Error('Failed to update config file');
}

/**
 * 触发 GitHub Actions 工作流
 * @param {Object} inputs - 工作流输入参数
 */
async function triggerWorkflow(inputs) {
  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/docker-build.yml/dispatches`,
    {
      method: 'POST',
      headers: GITHUB_HEADERS,
      body: JSON.stringify({
        ref: 'main',
        inputs: inputs
      })
    }
  );
  if (!response.ok) throw new Error('Failed to trigger workflow');
}

async function getWorkflowHistory() {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs`,
      { headers: GITHUB_HEADERS }
    );
    if (!response.ok) throw new Error('Failed to fetch workflow history');
    const data = await response.json();

    const workflowRuns = await Promise.all(
      data.workflow_runs.map(async run => {
        const jobsResponse = await fetch(
          `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${run.id}/jobs`,
          { headers: GITHUB_HEADERS }
        );
        const jobsData = await jobsResponse.json();
        const firstJobId = jobsData.jobs && jobsData.jobs.length > 0 ? jobsData.jobs[0].id : null;

        return {
          id: run.id,
          created_at: run.created_at,
          status: run.status,
          conclusion: run.conclusion,
          html_url: firstJobId ? `${run.html_url}/job/${firstJobId}` : run.html_url, // 修复 URL
          job_id: firstJobId // 添加 Job ID
        };
      })
    );

    return workflowRuns;
  } catch (error) {
    console.error('Error fetching workflow history:', error);
    return [];
  }
}

async function getConfigContent(runId) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/config_history/${runId}.env`,
      { headers: GITHUB_HEADERS }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const content = atob(data.content);
    const config = {};
    content.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) config[key.trim()] = value.trim();
    });
    return config;
  } catch (error) {
    return null;
  }
}
