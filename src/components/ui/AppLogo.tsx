'use client';

import React, { memo } from 'react';
import AppImage from './AppImage';

interface AppLogoProps {
  src?: string;
  size?: number;
  className?: string;
  onClick?: () => void;
  variant?: 'distribuidora' | 'mayorista' | 'envases' | 'default';
}

const LOGO_MAP = {
  distribuidora: '/assets/images/descarga__2_-1784608577889.png',
  mayorista: '/assets/images/descarga__1_-1784608578251.png',
  envases: '/assets/images/descarga-1784608578238.png',
  default: '/assets/images/descarga__1_-1784608578251.png',
};

const AppLogo = memo(function AppLogo({
  src,
  size = 64,
  className = '',
  onClick,
  variant = 'default',
}: AppLogoProps) {
  const logoSrc = src || LOGO_MAP[variant];

  return (
    <div
      className={`flex items-center ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''} ${className}`}
      onClick={onClick}
    >
      <AppImage
        src={logoSrc}
        alt="Logo DyL"
        width={size}
        height={size}
        className="flex-shrink-0 object-contain"
        priority={true}
      />
    </div>
  );
});

export default AppLogo;
