import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPane from '../ChatPane';

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

describe('ChatPane Component', () => {
  const mockSendMessage = vi.fn();
  const mockClearMessages = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Use the mocked import
    (useChat as any).mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: null,
    });
  });

  it('should render chat interface with input field', () => {
    render(<ChatPane messages={[]} />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('should display welcome message when no messages', () => {
    render(<ChatPane messages={[]} />);

    expect(screen.getByText(/welcome to ai data analyst/i)).toBeInTheDocument();
    expect(screen.getByText(/upload a csv file/i)).toBeInTheDocument();
  });

  it('should display messages in conversation', () => {
    (useChat as any).mockReturnValue({
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Hi there! How can I help you analyze your data?',
          timestamp: Date.now(),
        },
      ],
      isLoading: false,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      error: null,
    });

    render(<ChatPane messages={[]} />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText(/Hi there! How can I help/)).toBeInTheDocument();
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
    // Use imported mocked hook

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

    await user.type(input, 'Line 1{shift}{enter}Line 2');
    await user.keyboard('{enter}');

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
