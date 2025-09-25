import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import ChatPane from '../ChatPane';
import { ChatMessage } from '@/types';

const mockMessages: ChatMessage[] = [
  {
    id: '1',
    role: 'user',
    content: 'Hello, can you analyze my data?',
    timestamp: new Date(),
  },
  {
    id: '2',
    role: 'assistant',
    content: 'I can help you analyze your data. Please upload a CSV file.',
    timestamp: new Date(),
  },
  {
    id: '3',
    role: 'system',
    content: 'File uploaded successfully',
    timestamp: new Date(),
  },
];

describe('ChatPane Accessibility', () => {
  it('should not have accessibility violations', async () => {
    const { container } = render(
      <ChatPane
        threadId="test-thread"
        messages={mockMessages}
        onSendMessage={vi.fn()}
        onCancelRun={vi.fn()}
      />
    );

    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it('should have proper ARIA labels and roles', () => {
    render(
      <ChatPane
        threadId="test-thread"
        messages={mockMessages}
        onSendMessage={vi.fn()}
        onCancelRun={vi.fn()}
      />
    );

    // Check main container has proper role
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByLabelText('Chat conversation')).toBeInTheDocument();

    // Check messages container has proper role
    expect(screen.getByRole('log')).toBeInTheDocument();
    expect(screen.getByLabelText('Chat messages')).toBeInTheDocument();

    // Check input has proper labeling
    expect(screen.getByLabelText('Chat input')).toBeInTheDocument();

    // Check send button has proper labeling
    expect(screen.getByLabelText('Send message')).toBeInTheDocument();
  });

  it('should have proper keyboard navigation', () => {
    render(
      <ChatPane
        threadId="test-thread"
        messages={mockMessages}
        onSendMessage={vi.fn()}
        onCancelRun={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Chat input');
    const sendButton = screen.getByLabelText('Send message');

    // Input should be focusable
    input.focus();
    expect(document.activeElement).toBe(input);

    // Send button should be focusable
    sendButton.focus();
    expect(document.activeElement).toBe(sendButton);
  });

  it('should handle Enter key to send message', () => {
    const mockSendMessage = vi.fn();
    render(
      <ChatPane
        threadId="test-thread"
        messages={mockMessages}
        onSendMessage={mockSendMessage}
        onCancelRun={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Chat input');

    // Type a message
    fireEvent.change(input, { target: { value: 'Test message' } });

    // Press Enter
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(mockSendMessage).toHaveBeenCalledWith('Test message', null);
  });

  it('should announce status changes to screen readers', () => {
    const { rerender } = render(
      <ChatPane
        threadId="test-thread"
        messages={mockMessages}
        onSendMessage={vi.fn()}
        onCancelRun={vi.fn()}
        isRunning={false}
      />
    );

    // Check connection status is announced
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Rerender with running state
    rerender(
      <ChatPane
        threadId="test-thread"
        messages={mockMessages}
        onSendMessage={vi.fn()}
        onCancelRun={vi.fn()}
        isRunning={true}
      />
    );

    // Cancel button should have proper labeling
    expect(screen.getByLabelText('Cancel analysis')).toBeInTheDocument();
  });

  it('should have proper message structure for screen readers', () => {
    render(
      <ChatPane
        threadId="test-thread"
        messages={mockMessages}
        onSendMessage={vi.fn()}
        onCancelRun={vi.fn()}
      />
    );

    // Each message should be an article with proper labeling
    const messageArticles = screen.getAllByRole('article');
    expect(messageArticles).toHaveLength(3);

    // Check that messages have proper aria-labels
    expect(messageArticles[0]).toHaveAttribute('aria-label');
    expect(messageArticles[1]).toHaveAttribute('aria-label');
    expect(messageArticles[2]).toHaveAttribute('aria-label');
  });
});
