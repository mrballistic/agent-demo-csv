import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import ChatPane from '../ChatPane';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock the useChat hook
vi.mock('@/hooks/useChat', () => ({
  useChat: vi.fn(() => ({
    messages: [],
    isLoading: false,
    sendMessage: vi.fn(),
    clearMessages: vi.fn(),
    error: null,
  })),
}));

// Import the mocked hook so we can control its return value in tests
import { useChat } from '@/hooks/useChat';

describe('ChatPane Accessibility', () => {
  const mockSendMessage = vi.fn();
  const mockCancelRun = vi.fn();
  const mockClearMessages = vi.fn();
  const mockAddMessage = vi.fn();
  const mockResetConnection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Use the mocked import with all required properties
    (useChat as any).mockReturnValue({
      messages: [],
      isConnected: false,
      isRunning: false,
      runStatus: 'idle',
      connectionError: null,
      sendMessage: mockSendMessage,
      cancelRun: mockCancelRun,
      clearMessages: mockClearMessages,
      addMessage: mockAddMessage,
      resetConnection: mockResetConnection,
    });
  });

  const mockMessages = [
    {
      id: '1',
      role: 'user' as const,
      content: 'Hello, can you analyze my data?',
      timestamp: new Date(),
    },
    {
      id: '2',
      role: 'assistant' as const,
      content: 'I can help you analyze your data. Please upload a CSV file.',
      timestamp: new Date(),
    },
    {
      id: '3',
      role: 'system' as const,
      content: 'File uploaded successfully',
      timestamp: new Date(),
    },
  ];

  it('should not have accessibility violations', async () => {
    const { container } = render(
      <ChatPane threadId="test-thread" messages={mockMessages} />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have proper ARIA labels and roles', () => {
    render(<ChatPane threadId="test-thread" messages={mockMessages} />);

    // Main chat container
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByLabelText('Chat conversation')).toBeInTheDocument();

    // Messages area
    expect(screen.getByRole('log')).toBeInTheDocument();
    expect(screen.getByLabelText('Chat messages')).toBeInTheDocument();

    // Input field
    expect(screen.getByLabelText('Chat input')).toBeInTheDocument();

    // Send button
    expect(screen.getByLabelText('Send message')).toBeInTheDocument();
  });

  it('should have proper keyboard navigation', () => {
    render(<ChatPane threadId="test-thread" messages={mockMessages} />);

    const input = screen.getByLabelText('Chat input');
    const sendButton = screen.getByLabelText('Send message');

    // Input should be focusable
    expect(input).toBeVisible();
    expect(input.getAttribute('tabindex')).not.toBe('-1');

    // Send button should be focusable
    expect(sendButton).toBeVisible();
    expect(sendButton.getAttribute('tabindex')).not.toBe('-1');
  });

  it('should handle Enter key to send message', async () => {
    render(<ChatPane threadId="test-thread" messages={mockMessages} />);

    const input = screen.getByLabelText('Chat input');

    // Type a message
    fireEvent.change(input, { target: { value: 'Test message' } });

    // Simulate Enter key (keyDown to prevent default, keyUp to trigger send)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    fireEvent.keyUp(input, { key: 'Enter', shiftKey: false });

    // Wait for microtask to complete
    await Promise.resolve();

    // Check that the hook's sendMessage was called
    expect(mockSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('should announce status changes to screen readers', () => {
    // Mock the hook to return a running state to show the cancel button
    (useChat as any).mockReturnValue({
      messages: [],
      isConnected: true,
      isRunning: true,
      runStatus: 'running',
      connectionError: null,
      sendMessage: mockSendMessage,
      cancelRun: mockCancelRun,
      clearMessages: mockClearMessages,
      addMessage: mockAddMessage,
      resetConnection: mockResetConnection,
    });

    render(<ChatPane threadId="test-thread" messages={mockMessages} />);

    // Status should be announced to screen readers
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Cancel button should have proper labeling
    expect(screen.getByLabelText('Cancel analysis')).toBeInTheDocument();
  });

  it('should have proper message structure for screen readers', () => {
    render(<ChatPane threadId="test-thread" messages={mockMessages} />);

    // Each message should be an article with appropriate labeling
    const userMessage = screen.getByLabelText(/Message from user/);
    const assistantMessage = screen.getByLabelText(/Message from assistant/);
    const systemMessage = screen.getByLabelText(/Message from system/);

    expect(userMessage).toHaveAttribute('role', 'article');
    expect(assistantMessage).toHaveAttribute('role', 'article');
    expect(systemMessage).toHaveAttribute('role', 'article');

    // Messages should be focusable for keyboard navigation
    expect(userMessage).toHaveAttribute('tabindex', '0');
    expect(assistantMessage).toHaveAttribute('tabindex', '0');
    expect(systemMessage).toHaveAttribute('tabindex', '0');
  });

  it('should send message when form is submitted', async () => {
    const user = userEvent.setup();
    render(<ChatPane messages={[]} />);

    const input = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: /send/i });

    await user.type(input, 'Test message');
    await user.click(sendButton);

    expect(mockSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('should send message on Enter key press', async () => {
    const user = userEvent.setup();
    render(<ChatPane messages={[]} />);

    const input = screen.getByRole('textbox');

    await user.type(input, 'Test message{enter}');

    expect(mockSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('should not send empty messages', async () => {
    const user = userEvent.setup();
    render(<ChatPane messages={[]} />);

    const sendButton = screen.getByRole('button', { name: /send/i });

    await user.click(sendButton);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('should clear input after sending message', async () => {
    const user = userEvent.setup();
    render(<ChatPane messages={[]} />);

    const input = screen.getByRole('textbox') as HTMLInputElement;

    await user.type(input, 'Test message');
    await user.keyboard('{enter}');

    expect(input.value).toBe('');
  });

  it('should disable input and button when loading', () => {
    (useChat as any).mockReturnValue({
      messages: [],
      isLoading: true,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: null,
    });

    render(<ChatPane messages={[]} />);

    const input = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: /send/i });

    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });

  it('should show loading indicator when processing', () => {
    (useChat as any).mockReturnValue({
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'Analyze my data',
          timestamp: Date.now(),
        },
      ],
      isLoading: true,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: null,
    });

    render(<ChatPane messages={[]} />);

    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
  });

  it('should display error messages', () => {
    (useChat as any).mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: 'Failed to send message',
    });

    render(<ChatPane messages={[]} />);

    expect(screen.getByText(/failed to send message/i)).toBeInTheDocument();
  });

  it('should scroll to bottom when new messages arrive', async () => {
    // Mock scrollIntoView
    const mockScrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = mockScrollIntoView;

    const { rerender } = render(<ChatPane messages={[]} />);

    // Add a new message
    (useChat as any).mockReturnValue({
      messages: [
        {
          id: '1',
          role: 'assistant',
          content: 'New message',
          timestamp: Date.now(),
        },
      ],
      isLoading: false,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: null,
    });

    rerender(<ChatPane messages={[]} />);

    await waitFor(() => {
      expect(mockScrollIntoView).toHaveBeenCalled();
    });
  });

  it('should handle system messages differently', () => {
    (useChat as any).mockReturnValue({
      messages: [
        {
          id: '1',
          role: 'system',
          content: 'File uploaded successfully',
          timestamp: Date.now(),
        },
      ],
      isLoading: false,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: null,
    });

    render(<ChatPane messages={[]} />);

    const systemMessage = screen.getByText(/file uploaded successfully/i);
    expect(systemMessage).toBeInTheDocument();
    expect(systemMessage.closest('[data-role="system"]')).toBeInTheDocument();
  });

  it('should format timestamps correctly', () => {
    const testTimestamp = new Date('2024-01-01T12:00:00Z').getTime();
    (useChat as any).mockReturnValue({
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'Test message',
          timestamp: testTimestamp,
        },
      ],
      isLoading: false,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: null,
    });

    render(<ChatPane messages={[]} />);

    // Should display formatted time
    expect(screen.getByText(/12:00/)).toBeInTheDocument();
  });

  it('should handle multiline messages', async () => {
    const user = userEvent.setup();
    render(<ChatPane messages={[]} />);

    const input = screen.getByRole('textbox');

    // Type the content with explicit newline handling
    await user.type(input, 'Line 1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(input, 'Line 2');
    await user.keyboard('{Enter}');

    expect(mockSendMessage).toHaveBeenCalledWith('Line 1\nLine 2');
  });

  it('should support keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<ChatPane messages={[]} />);

    const input = screen.getByRole('textbox');

    // Tab should focus the input
    await user.tab();
    expect(input).toHaveFocus();

    // Tab again should focus the send button
    await user.tab();
    expect(screen.getByRole('button', { name: /send/i })).toHaveFocus();
  });

  it('should handle message with artifacts', () => {
    (useChat as any).mockReturnValue({
      messages: [
        {
          id: '1',
          role: 'assistant',
          content: 'Analysis complete',
          timestamp: Date.now(),
          artifacts: [
            {
              id: 'artifact_1',
              name: 'chart.png',
              type: 'image',
              downloadUrl: '/api/artifacts/artifact_1/download',
            },
          ],
        },
      ],
      isLoading: false,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: null,
    });

    render(<ChatPane messages={[]} />);

    expect(screen.getByText(/analysis complete/i)).toBeInTheDocument();
    expect(screen.getByText(/chart\.png/i)).toBeInTheDocument();
  });

  it('should handle streaming message updates', async () => {
    // Initial state with partial message
    (useChat as any).mockReturnValue({
      messages: [
        {
          id: '1',
          role: 'assistant',
          content: 'Analyzing your data...',
          timestamp: Date.now(),
          streaming: true,
        },
      ],
      isLoading: true,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: null,
    });

    const { rerender } = render(<ChatPane messages={[]} />);

    expect(screen.getByText(/analyzing your data\.\.\./i)).toBeInTheDocument();

    // Update with complete message
    (useChat as any).mockReturnValue({
      messages: [
        {
          id: '1',
          role: 'assistant',
          content: 'Analysis complete! Here are your insights...',
          timestamp: Date.now(),
          streaming: false,
        },
      ],
      isLoading: false,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: null,
    });

    rerender(<ChatPane messages={[]} />);

    expect(
      screen.getByText(/analysis complete! here are your insights/i)
    ).toBeInTheDocument();
  });
});
