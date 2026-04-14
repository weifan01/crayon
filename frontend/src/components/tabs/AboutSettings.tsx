import { useEffect, useState } from 'react'
import { useLocale } from '../../stores/localeStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { getAppInfo, AUTHOR_INFO, AI_INFO, AppInfo } from '../../version'

export function AboutSettings() {
  const { t } = useLocale()
  const theme = useSettingsStore.getState().getTheme()
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    getAppInfo().then(setAppInfo)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h3 className="text-sm font-medium mb-4" style={{ color: theme.ui.textSecondary }}>
        {t('about.title')}
      </h3>

      {/* 应用信息 */}
      <div className="space-y-4">
        <div
          className="p-6 rounded-xl text-center"
          style={{ backgroundColor: theme.ui.surface1 }}
        >
          <div className="text-3xl font-bold mb-2" style={{ color: theme.ui.accent }}>
            {appInfo?.name || 'Crayon'}
          </div>
          <div className="text-lg" style={{ color: theme.ui.textPrimary }}>
            {appInfo?.version || '-'}
          </div>
          <div className="text-sm mt-2" style={{ color: theme.ui.textMuted }}>
            {t('about.subtitle')}
          </div>
        </div>

        {/* 构建信息 */}
        <div
          className="p-4 rounded-xl"
          style={{ backgroundColor: theme.ui.surface1 }}
        >
          <h4 className="font-medium mb-3" style={{ color: theme.ui.textPrimary }}>
            {t('about.buildInfo')}
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span style={{ color: theme.ui.textMuted }}>{t('about.version')}</span>
              <span style={{ color: theme.ui.textPrimary }}>{appInfo?.version || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: theme.ui.textMuted }}>{t('about.buildDate')}</span>
              <span style={{ color: theme.ui.textPrimary }}>{appInfo?.buildTime || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: theme.ui.textMuted }}>{t('about.platform')}</span>
              <span style={{ color: theme.ui.textPrimary }}>{appInfo?.platform || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: theme.ui.textMuted }}>{t('about.goVersion')}</span>
              <span style={{ color: theme.ui.textPrimary }}>{appInfo?.goVersion || '-'}</span>
            </div>
            {appInfo?.gitCommit && (
              <div className="flex justify-between">
                <span style={{ color: theme.ui.textMuted }}>Git Commit</span>
                <span style={{ color: theme.ui.textPrimary }} className="font-mono text-xs">
                  {appInfo.gitCommit.substring(0, 8)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 作者信息 */}
        <div
          className="p-4 rounded-xl"
          style={{ backgroundColor: theme.ui.surface1 }}
        >
          <h4 className="font-medium mb-3" style={{ color: theme.ui.textPrimary }}>
            {t('about.author')}
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span style={{ color: theme.ui.textMuted }}>{t('about.authorName')}</span>
              <span style={{ color: theme.ui.textPrimary }}>{appInfo?.author || AUTHOR_INFO.name}</span>
            </div>
            {AUTHOR_INFO.github && (
              <div className="flex justify-between items-center">
                <span style={{ color: theme.ui.textMuted }}>GitHub</span>
                <a
                  href={AUTHOR_INFO.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: theme.ui.accent }}
                >
                  {AUTHOR_INFO.github}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* AI 信息 */}
        <div
          className="p-4 rounded-xl"
          style={{ backgroundColor: theme.ui.surface1 }}
        >
          <h4 className="font-medium mb-3" style={{ color: theme.ui.textPrimary }}>
            {t('about.aiInfo')}
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span style={{ color: theme.ui.textMuted }}>{t('about.aiModel')}</span>
              <span style={{ color: theme.ui.textPrimary }}>{AI_INFO.model}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: theme.ui.textMuted }}>{t('about.aiCodingAgent')}</span>
              <span style={{ color: theme.ui.textPrimary }}>{AI_INFO.codingAgent}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: theme.ui.textMuted }}>{t('about.aiProvider')}</span>
              <a
                href={AI_INFO.modelProvider}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: theme.ui.accent }}
              >
                {AI_INFO.modelProvider}
              </a>
            </div>
          </div>
        </div>

        {/* 致谢 */}
        <div
          className="p-4 rounded-xl text-sm"
          style={{ backgroundColor: theme.ui.surface1, color: theme.ui.textMuted }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: theme.ui.accent }}>✨</span>
            <span style={{ color: theme.ui.textPrimary }}>{t('about.acknowledgements')}</span>
          </div>
          <p>{t('about.acknowledgementsText')}</p>
        </div>
      </div>
    </div>
  )
}