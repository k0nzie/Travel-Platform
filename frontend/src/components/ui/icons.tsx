import type { ReactNode, SVGProps } from 'react';

/**
 * One icon set for the whole app (24px grid, 1.75 stroke, inherits text colour).
 * Size with classes: <PlaneIcon className="size-4" />. Add new icons here, in the same style.
 */
export type IconProps = SVGProps<SVGSVGElement>;

function make(paths: ReactNode, displayName: string) {
  function Icon({ className = 'size-5', ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className}
        {...props}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const PlaneIcon = make(
  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />,
  'PlaneIcon',
);
export const BedIcon = make(
  <>
    <path d="M2 4v16" />
    <path d="M2 8h18a2 2 0 0 1 2 2v10" />
    <path d="M2 17h20" />
    <path d="M6 8v9" />
  </>,
  'BedIcon',
);
export const MapIcon = make(
  <>
    <path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z" />
    <path d="M9 3v15M15 6v15" />
  </>,
  'MapIcon',
);
export const PenIcon = make(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </>,
  'PenIcon',
);
export const BellIcon = make(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>,
  'BellIcon',
);
export const UserIcon = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
  'UserIcon',
);
export const LogOutIcon = make(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </>,
  'LogOutIcon',
);
export const ChevronLeftIcon = make(<path d="m15 18-6-6 6-6" />, 'ChevronLeftIcon');
export const ChevronRightIcon = make(<path d="m9 18 6-6-6-6" />, 'ChevronRightIcon');
export const ChevronDownIcon = make(<path d="m6 9 6 6 6-6" />, 'ChevronDownIcon');
export const XIcon = make(<path d="M18 6 6 18M6 6l12 12" />, 'XIcon');
export const CheckIcon = make(<path d="M20 6 9 17l-5-5" />, 'CheckIcon');
export const AlertIcon = make(
  <>
    <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
  'AlertIcon',
);
export const InfoIcon = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
  'InfoIcon',
);
export const CheckCircleIcon = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </>,
  'CheckCircleIcon',
);
export const SearchIcon = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
  'SearchIcon',
);
export const UploadIcon = make(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m17 8-5-5-5 5M12 3v12" />
  </>,
  'UploadIcon',
);
export const TrashIcon = make(
  <>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </>,
  'TrashIcon',
);
export const CalendarIcon = make(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </>,
  'CalendarIcon',
);
export const ClockIcon = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </>,
  'ClockIcon',
);
export const MenuIcon = make(<path d="M4 6h16M4 12h16M4 18h16" />, 'MenuIcon');
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />, 'PlusIcon');
export const EyeIcon = make(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
  'EyeIcon',
);
export const EyeOffIcon = make(
  <>
    <path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="m2 2 20 20M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </>,
  'EyeOffIcon',
);
export const ShieldIcon = make(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, 'ShieldIcon');
export const InboxIcon = make(
  <>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" />
  </>,
  'InboxIcon',
);
export const ImageIcon = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </>,
  'ImageIcon',
);
export const ArrowLeftIcon = make(<path d="M19 12H5M12 19l-7-7 7-7" />, 'ArrowLeftIcon');
export const SettingsIcon = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
  'SettingsIcon',
);
export const SpinnerIcon = make(<path d="M21 12a9 9 0 1 1-6.2-8.6" />, 'SpinnerIcon');
