import { motion, AnimatePresence } from 'framer-motion';
import React from 'react';

// Animation variants for social media components

export const slideInFromRight = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: '100%', opacity: 0 },
  transition: { type: 'spring', damping: 25, stiffness: 200 }
};

export const slideInFromBottom = {
  initial: { y: '100%', opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: '100%', opacity: 0 },
  transition: { type: 'spring', damping: 25, stiffness: 200 }
};

export const fadeInScale = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
  transition: { duration: 0.2 }
};

export const staggerContainer = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1
    }
  }
};

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 }
};

// Animated wrapper for social posts
export const AnimatedSocialPost = ({ children, index, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.2, delay: index * 0.05 + delay }}
  >
    {children}
  </motion.div>
);

// Animated modal wrapper
export const AnimatedModal = ({ children, onClose, className = '' }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className={`fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 ${className}`}
    onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-[#111118] border border-white/10 rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>
  </motion.div>
);

// Animated list container
export const AnimatedList = ({ children, className = '' }) => (
  <motion.div
    variants={staggerContainer}
    initial="initial"
    animate="animate"
    className={`space-y-3 ${className}`}
  >
    {React.Children.map(children, (child, index) => (
      <motion.div key={index} variants={staggerItem}>
        {child}
      </motion.div>
    ))}
  </motion.div>
);

// Animated button with press effect
export const AnimatedButton = ({ 
  children, 
  onClick, 
  className = '', 
  disabled = false,
  variant = 'primary' 
}) => {
  const variants = {
    primary: {
      rest: { scale: 1, backgroundColor: 'rgb(168, 85, 247)' },
      hover: { scale: 1.02, backgroundColor: 'rgb(147, 51, 234)' },
      tap: { scale: 0.98, backgroundColor: 'rgb(126, 34, 206)' }
    },
    secondary: {
      rest: { scale: 1, backgroundColor: 'rgb(55, 65, 81)' },
      hover: { scale: 1.02, backgroundColor: 'rgb(75, 85, 99)' },
      tap: { scale: 0.98, backgroundColor: 'rgb(55, 65, 81)' }
    },
    ghost: {
      rest: { scale: 1, backgroundColor: 'transparent' },
      hover: { scale: 1.02, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
      tap: { scale: 0.98, backgroundColor: 'rgba(255, 255, 255, 0.02)' }
    }
  };

  return (
    <motion.button
      variants={variants[variant]}
      initial="rest"
      whileHover="hover"
      whileTap="tap"
      disabled={disabled}
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-white font-medium transition-all ${className}`}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </motion.button>
  );
};

// Animated card with hover effect
export const AnimatedCard = ({ 
  children, 
  className = '', 
  hover = true,
  onClick = null 
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={hover ? { 
      scale: 1.02, 
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
      transition: { duration: 0.2 }
    } : {}}
    whileTap={onClick ? { scale: 0.98 } : {}}
    onClick={onClick}
    className={`bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden ${className}`}
  >
    {children}
  </motion.div>
);

// Animated notification badge
export const AnimatedNotificationBadge = ({ count, max = 99 }) => {
  if (count === 0) return null;
  
  const displayCount = count > max ? `${max}+` : count;
  
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
    >
      {displayCount}
    </motion.div>
  );
};

// Animated loading dots
export const AnimatedLoadingDots = ({ className = '' }) => (
  <div className={`flex items-center gap-1 ${className}`}>
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: i * 0.1 }}
        className="w-2 h-2 bg-purple-500 rounded-full"
        style={{
          animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`
        }}
      />
    ))}
  </div>
);

// Animated success checkmark
export const AnimatedSuccessCheck = ({ size = 24, className = '' }) => (
  <motion.svg
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`text-green-400 ${className}`}
  >
    <motion.path
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      d="M20 6L9 17l-5-5"
    />
  </motion.svg>
);

// Animated error X
export const AnimatedErrorX = ({ size = 24, className = '' }) => (
  <motion.svg
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`text-red-400 ${className}`}
  >
    <motion.path
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      d="M18 6L6 18M6 6l12 12"
    />
  </motion.svg>
);

// Animated pulse effect for live indicators
export const AnimatedPulse = ({ children, className = '' }) => (
  <motion.div
    className={`relative ${className}`}
    animate={{
      scale: [1, 1.05, 1],
      opacity: [1, 0.8, 1]
    }}
    transition={{
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut"
    }}
  >
    {children}
    <motion.div
      className="absolute inset-0 bg-red-500 rounded-full opacity-20"
      animate={{
        scale: [1, 1.5, 1],
        opacity: [0.3, 0, 0.3]
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />
  </motion.div>
);

// Animated slide transition for tabs
export const AnimatedTabContent = ({ children, activeTab, tabKey }) => (
  <AnimatePresence mode="wait">
    {activeTab === tabKey && (
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

// Animated progress bar
export const AnimatedProgressBar = ({ progress, className = '' }) => (
  <div className={`w-full bg-white/[0.06] rounded-full h-2 ${className}`}>
    <motion.div
      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
      initial={{ width: 0 }}
      animate={{ width: `${progress}%` }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    />
  </div>
);

// Animated skeleton shimmer effect
export const AnimatedShimmer = ({ className = '' }) => (
  <motion.div
    className={`bg-gradient-to-r from-transparent via-white/[0.1] to-transparent ${className}`}
    animate={{
      x: ['-100%', '100%']
    }}
    transition={{
      duration: 1.5,
      repeat: Infinity,
      ease: "linear"
    }}
  />
);

// Animated floating action button
export const AnimatedFab = ({ 
  children, 
  onClick, 
  className = '',
  icon = null 
}) => (
  <motion.button
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    whileHover={{ scale: 1.1, rotate: 5 }}
    whileTap={{ scale: 0.9, rotate: -5 }}
    onClick={onClick}
    className={`w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center justify-center shadow-lg ${className}`}
  >
    {icon || children}
  </motion.button>
);

// Animated page transition
export const PageTransition = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3 }}
  >
    {children}
  </motion.div>
);

// Animated staggered grid
export const AnimatedGrid = ({ children, columns = 2, className = '' }) => (
  <motion.div
    variants={staggerContainer}
    initial="initial"
    animate="animate"
    className={`grid grid-cols-${columns} gap-3 ${className}`}
  >
    {React.Children.map(children, (child, index) => (
      <motion.div key={index} variants={staggerItem}>
        {child}
      </motion.div>
    ))}
  </motion.div>
);

// Custom hook for animation states
export const useAnimationState = (initialState = false) => {
  const [isAnimating, setIsAnimating] = React.useState(initialState);
  
  const startAnimation = React.useCallback(() => {
    setIsAnimating(true);
  }, []);
  
  const stopAnimation = React.useCallback(() => {
    setIsAnimating(false);
  }, []);
  
  return { isAnimating, startAnimation, stopAnimation };
};

// Animated number counter
export const AnimatedCounter = ({ 
  value, 
  duration = 1000, 
  className = '',
  format = (n) => n.toString() 
}) => {
  const [displayValue, setDisplayValue] = React.useState(0);
  
  React.useEffect(() => {
    const start = 0;
    const end = value;
    const startTime = Date.now();
    
    const animate = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / duration, 1);
      const currentValue = Math.floor(start + (end - start) * progress);
      
      setDisplayValue(currentValue);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }, [value, duration]);
  
  return (
    <motion.span
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      {format(displayValue)}
    </motion.span>
  );
};
