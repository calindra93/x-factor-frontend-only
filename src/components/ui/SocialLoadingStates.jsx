import React from 'react';
import { motion } from 'framer-motion';
import { Play, Users, MessageCircle, Radio, Bell, RefreshCw } from 'lucide-react';

// Skeleton loading components for social media features

export const SocialPostSkeleton = ({ count = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.1 }}
        className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden"
      >
        <div className="flex gap-3 p-3">
          <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 animate-pulse" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 bg-white/[0.06] rounded animate-pulse" />
            <div className="h-3 bg-white/[0.04] rounded w-3/4 animate-pulse" />
            <div className="flex gap-3">
              <div className="h-3 bg-white/[0.04] rounded w-16 animate-pulse" />
              <div className="h-3 bg-white/[0.04] rounded w-12 animate-pulse" />
              <div className="h-3 bg-white/[0.04] rounded w-14 animate-pulse" />
            </div>
          </div>
        </div>
      </motion.div>
    ))}
  </div>
);

export const LiveStreamSkeleton = () => (
  <div className="space-y-4">
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-red-500/20 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/[0.06] rounded animate-pulse" />
          <div className="h-3 bg-white/[0.04] rounded w-2/3 animate-pulse" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-3 bg-white/[0.04] rounded animate-pulse" />
        <div className="h-3 bg-white/[0.04] rounded w-4/5 animate-pulse" />
        <div className="h-3 bg-white/[0.04] rounded w-3/5 animate-pulse" />
      </div>
    </div>
  </div>
);

export const CollaborationSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 3 }).map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.1 }}
        className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-500/20 animate-pulse" />
          <div className="flex-1 space-y-1">
            <div className="h-3 bg-white/[0.06] rounded animate-pulse" />
            <div className="h-2 bg-white/[0.04] rounded w-2/3 animate-pulse" />
          </div>
          <div className="h-6 bg-white/[0.04] rounded w-16 animate-pulse" />
        </div>
      </motion.div>
    ))}
  </div>
);

export const CommunityMessagesSkeleton = ({ count = 5 }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.05 }}
        className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3"
      >
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-blue-500/20 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-3 bg-white/[0.06] rounded w-20 animate-pulse" />
              <div className="h-2 bg-white/[0.04] rounded w-12 animate-pulse" />
            </div>
            <div className="h-3 bg-white/[0.04] rounded animate-pulse" />
            <div className="h-3 bg-white/[0.04] rounded w-4/5 animate-pulse" />
          </div>
        </div>
      </motion.div>
    ))}
  </div>
);

export const NotificationSkeleton = ({ count = 4 }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.05 }}
        className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 animate-pulse" />
          <div className="flex-1 space-y-1">
            <div className="h-3 bg-white/[0.06] rounded animate-pulse" />
            <div className="h-2 bg-white/[0.04] rounded w-3/4 animate-pulse" />
          </div>
          <div className="h-2 bg-white/[0.04] rounded w-12 animate-pulse" />
        </div>
      </motion.div>
    ))}
  </div>
);

// Loading spinner variants
export const LoadingSpinner = ({ size = 'md', color = 'white' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  const colorClasses = {
    white: 'border-white/30 border-t-white',
    red: 'border-red-500/30 border-t-red-500',
    blue: 'border-blue-500/30 border-t-blue-500',
    purple: 'border-purple-500/30 border-t-purple-500',
    green: 'border-green-500/30 border-t-green-500'
  };

  return (
    <div className={`${sizeClasses[size]} ${colorClasses[color]} border-2 rounded-full animate-spin`} />
  );
};

// Full-screen loading states
export const FullScreenLoading = ({ message = 'Loading...', icon = Play }) => {
  const Icon = icon;
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <Icon className="w-8 h-8 text-white animate-pulse" />
        </div>
        <div className="space-y-2">
          <p className="text-white text-sm font-medium">{message}</p>
          <LoadingSpinner size="lg" color="purple" />
        </div>
      </div>
    </div>
  );
};

// Empty state components
export const EmptyState = ({ 
  icon = Play, 
  title = 'No content found', 
  description = 'Try adjusting your filters or create something new',
  action = null 
}) => {
  const Icon = icon;
  return (
    <div className="text-center py-10">
      <div className="w-16 h-16 rounded-xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
        <Icon className="w-8 h-8 text-gray-500" />
      </div>
      <h3 className="text-white text-sm font-semibold mb-2">{title}</h3>
      <p className="text-gray-500 text-sm mb-4">{description}</p>
      {action && action}
    </div>
  );
};

// Error state components
export const ErrorState = ({ 
  error, 
  onRetry, 
  title = 'Something went wrong',
  description = 'Please try again or contact support if the issue persists'
}) => (
  <div className="text-center py-10">
    <div className="w-16 h-16 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
      <RefreshCw className="w-8 h-8 text-red-400" />
    </div>
    <h3 className="text-white text-sm font-semibold mb-2">{title}</h3>
    <p className="text-gray-500 text-sm mb-4">{description}</p>
    {error && (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
        <p className="text-red-400 text-xs font-mono">{error.message || 'Unknown error'}</p>
      </div>
    )}
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors"
      >
        Try Again
      </button>
    )}
  </div>
);

// Platform-specific loading states
export const VidWaveLoading = () => (
  <div className="space-y-4">
    <div className="bg-white/[0.03] border border-red-500/20 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-red-500/20 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/[0.06] rounded animate-pulse" />
          <div className="h-3 bg-white/[0.04] rounded w-2/3 animate-pulse" />
        </div>
      </div>
      <SocialPostSkeleton count={2} />
    </div>
  </div>
);

export const LoopTokLoading = () => (
  <div className="space-y-4">
    <div className="bg-white/[0.03] border border-pink-500/20 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-pink-500/20 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/[0.06] rounded animate-pulse" />
          <div className="h-3 bg-white/[0.04] rounded w-2/3 animate-pulse" />
        </div>
      </div>
      <SocialPostSkeleton count={3} />
    </div>
  </div>
);

export const ForYouLoading = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.1 }}
          className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3"
        >
          <div className="w-full h-20 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 animate-pulse mb-2" />
          <div className="space-y-1">
            <div className="h-3 bg-white/[0.06] rounded animate-pulse" />
            <div className="h-2 bg-white/[0.04] rounded w-3/4 animate-pulse" />
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);

// Loading overlay for modals
export const ModalLoadingOverlay = ({ message = 'Processing...' }) => (
  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 rounded-xl">
    <div className="bg-[#111118] border border-white/[0.10] rounded-xl p-4 text-center">
      <LoadingSpinner size="lg" color="purple" />
      <p className="text-white text-sm mt-3">{message}</p>
    </div>
  </div>
);

// Progress indicator for multi-step processes
export const ProgressIndicator = ({ current, total, steps = [] }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-xs text-gray-400">
      <span>Step {current} of {total}</span>
      <span>{Math.round((current / total) * 100)}%</span>
    </div>
    <div className="w-full bg-white/[0.06] rounded-full h-2">
      <motion.div
        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${(current / total) * 100}%` }}
        transition={{ duration: 0.3 }}
      />
    </div>
    {steps.length > 0 && (
      <div className="flex justify-between text-xs">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex-1 text-center ${
              i < current ? 'text-green-400' : 
              i === current ? 'text-white' : 'text-gray-500'
            }`}
          >
            {step}
          </div>
        ))}
      </div>
    )}
  </div>
);
