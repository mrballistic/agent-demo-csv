/**
 * Test a DOM element for accessibility violations using axe-core
 * This function should be used in test files with proper axe setup
 */
export async function testAccessibility(element: Element): Promise<any> {
  // This will be implemented in test files with proper axe imports
  return Promise.resolve();
}

/**
 * Generate alt text for charts based on manifest data
 */
export function generateChartAltText(manifest: {
  insight?: string;
  metadata?: {
    analysis_type?: string;
    columns_used?: string[];
  };
}): string {
  const { insight, metadata } = manifest;
  const analysisType = metadata?.analysis_type || 'analysis';
  const columns = metadata?.columns_used || [];

  let altText = `Chart showing ${analysisType}`;

  if (columns.length > 0) {
    altText += ` using ${columns.join(', ')}`;
  }

  if (insight) {
    altText += `. ${insight}`;
  }

  return altText;
}

/**
 * Keyboard navigation utilities
 */
export const KeyboardNavigation = {
  /**
   * Handle roving tabindex for a list of elements
   */
  setupRovingTabIndex: (
    elements: HTMLElement[],
    currentIndex: number = 0
  ): (() => void) => {
    // Set initial tabindex values
    elements.forEach((element, index) => {
      element.tabIndex = index === currentIndex ? 0 : -1;
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const currentIdx = elements.indexOf(target);

      if (currentIdx === -1) return;

      let nextIndex = currentIdx;

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          nextIndex = (currentIdx + 1) % elements.length;
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          nextIndex = currentIdx === 0 ? elements.length - 1 : currentIdx - 1;
          break;
        case 'Home':
          event.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          event.preventDefault();
          nextIndex = elements.length - 1;
          break;
        default:
          return;
      }

      // Update tabindex and focus
      if (elements[currentIdx]) {
        elements[currentIdx].tabIndex = -1;
      }
      const nextElement = elements[nextIndex];
      if (nextElement) {
        nextElement.tabIndex = 0;
        nextElement.focus();
      }
    };

    // Add event listeners
    elements.forEach(element => {
      element.addEventListener('keydown', handleKeyDown);
    });

    // Return cleanup function
    return () => {
      elements.forEach(element => {
        element.removeEventListener('keydown', handleKeyDown);
      });
    };
  },

  /**
   * Trap focus within a container
   */
  trapFocus: (container: HTMLElement): (() => void) => {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          if (lastElement) {
            lastElement.focus();
          }
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          if (firstElement) {
            firstElement.focus();
          }
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // Focus first element
    if (firstElement) {
      firstElement.focus();
    }

    // Return cleanup function
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  },
};

/**
 * Announce messages to screen readers
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Screen reader only CSS class
 */
export const srOnlyStyles = {
  position: 'absolute' as const,
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap' as const,
  border: 0,
};
