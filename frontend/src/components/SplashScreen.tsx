import { useEffect, useState } from 'react'

interface SplashScreenProps {
  onFinish: () => void
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // 2.5秒后开始退出动画
    const exitTimer = setTimeout(() => {
      setIsExiting(true)
    }, 2500)

    // 3秒后完全消失
    const finishTimer = setTimeout(() => {
      onFinish()
    }, 3000)

    return () => {
      clearTimeout(exitTimer)
      clearTimeout(finishTimer)
    }
  }, [onFinish])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        transition: 'opacity 0.5s ease-out',
        opacity: isExiting ? 0 : 1,
      }}
    >
      {/* 背景星星 */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: Math.random() * 3 + 1 + 'px',
              height: Math.random() * 3 + 1 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              animation: `twinkle ${1.5 + Math.random()}s ease-in-out infinite`,
              animationDelay: Math.random() * 2 + 's',
              opacity: 0.3 + Math.random() * 0.5,
            }}
          />
        ))}
      </div>

      <div className="flex flex-col items-center">
        {/* 蜡笔人动画 */}
        <div className="relative" style={{ animation: 'crayonBounce 1s ease-in-out infinite' }}>
          {/* 蜡笔身体 */}
          <svg
            width="120"
            height="200"
            viewBox="0 0 120 200"
            className="drop-shadow-2xl"
          >
            {/* 定义渐变 */}
            <defs>
              <linearGradient id="crayonBody" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FF6B6B" />
                <stop offset="50%" stopColor="#FF8E8E" />
                <stop offset="100%" stopColor="#FF6B6B" />
              </linearGradient>
              <linearGradient id="crayonTip" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFB6B6" />
                <stop offset="100%" stopColor="#FF6B6B" />
              </linearGradient>
              <linearGradient id="crayonStripe" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FFE66D" />
                <stop offset="100%" stopColor="#FFD93D" />
              </linearGradient>
            </defs>

            {/* 蜡笔身体 - 圆角矩形 */}
            <rect
              x="20"
              y="50"
              width="80"
              height="130"
              rx="8"
              ry="8"
              fill="url(#crayonBody)"
              style={{ animation: 'crayonWiggle 0.5s ease-in-out infinite' }}
            />

            {/* 蜡笔条纹 */}
            <rect
              x="20"
              y="70"
              width="80"
              height="15"
              fill="url(#crayonStripe)"
            />
            <rect
              x="20"
              y="130"
              width="80"
              height="15"
              fill="url(#crayonStripe)"
            />

            {/* 蜡笔尖 */}
            <polygon
              points="35,180 85,180 60,200"
              fill="url(#crayonTip)"
            />

            {/* 蜡笔尖端 */}
            <polygon
              points="55,195 65,195 60,200"
              fill="#FFB6B6"
            />

            {/* 蜡笔头部（圆角） */}
            <rect
              x="20"
              y="50"
              width="80"
              height="30"
              rx="8"
              ry="8"
              fill="url(#crayonBody)"
            />

            {/* 眼睛 */}
            <g style={{ animation: 'blink 3s ease-in-out infinite' }}>
              {/* 左眼 */}
              <ellipse cx="45" cy="35" rx="12" ry="14" fill="white" />
              <ellipse cx="47" cy="37" rx="6" ry="7" fill="#333" />
              <ellipse cx="49" cy="34" rx="2" ry="2" fill="white" />
              {/* 右眼 */}
              <ellipse cx="75" cy="35" rx="12" ry="14" fill="white" />
              <ellipse cx="77" cy="37" rx="6" ry="7" fill="#333" />
              <ellipse cx="79" cy="34" rx="2" ry="2" fill="white" />
            </g>

            {/* 微笑 */}
            <path
              d="M 45 55 Q 60 70 75 55"
              stroke="#333"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              style={{ animation: 'smile 2s ease-in-out infinite' }}
            />

            {/* 腮红 */}
            <ellipse cx="30" cy="45" rx="8" ry="5" fill="#FF9999" opacity="0.6" />
            <ellipse cx="90" cy="45" rx="8" ry="5" fill="#FF9999" opacity="0.6" />

            {/* 小手 - 左 */}
            <ellipse
              cx="10"
              cy="100"
              rx="10"
              ry="15"
              fill="url(#crayonBody)"
              style={{ animation: 'waveLeft 1s ease-in-out infinite', transformOrigin: '20px 100px' }}
            />
            {/* 小手 - 右 */}
            <ellipse
              cx="110"
              cy="100"
              rx="10"
              ry="15"
              fill="url(#crayonBody)"
              style={{ animation: 'waveRight 1s ease-in-out infinite 0.5s', transformOrigin: '100px 100px' }}
            />
          </svg>
        </div>

        {/* 文字 */}
        <div className="mt-8 text-center">
          <h1
            className="text-4xl font-bold"
            style={{
              background: 'linear-gradient(90deg, #FF6B6B, #FFE66D, #4ECDC4, #FF6B6B)',
              backgroundSize: '300% 100%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'gradient 3s ease infinite',
            }}
          >
            Crayon
          </h1>
        </div>

        {/* 加载指示器 */}
        <div className="mt-6 flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: '#FF6B6B',
                animation: 'loadingDot 1s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes crayonBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes crayonWiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(1deg); }
          75% { transform: rotate(-1deg); }
        }

        @keyframes blink {
          0%, 45%, 55%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.1); }
        }

        @keyframes smile {
          0%, 100% { d: path("M 45 55 Q 60 70 75 55"); }
          50% { d: path("M 45 55 Q 60 75 75 55"); }
        }

        @keyframes waveLeft {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-15deg); }
        }

        @keyframes waveRight {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(15deg); }
        }

        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.5); }
        }

        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes loadingDot {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}