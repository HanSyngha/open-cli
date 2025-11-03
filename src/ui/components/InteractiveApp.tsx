/**
 * Interactive App - Ink UI
 *
 * React + Ink 기반 인터랙티브 터미널 UI
 */

import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { LLMClient } from '../../core/llm-client.js';
import { Message } from '../../types/index.js';

interface InteractiveAppProps {
  llmClient: LLMClient;
  modelInfo: {
    model: string;
    endpoint: string;
  };
}

export const InteractiveApp: React.FC<InteractiveAppProps> = ({ llmClient, modelInfo }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [currentThinking, setCurrentThinking] = useState('');

  // 키보드 단축키
  useInput((inputChar: string, key: { ctrl: boolean; shift: boolean; meta: boolean }) => {
    if (key.ctrl && inputChar === 'c') {
      exit();
    }
  });

  const handleSubmit = async (value: string) => {
    if (!value.trim() || isProcessing) {
      return;
    }

    const userMessage = value.trim();
    setInput('');

    // 메타 명령어 처리
    if (userMessage === '/exit' || userMessage === '/quit') {
      exit();
      return;
    }

    if (userMessage === '/clear') {
      setMessages([]);
      return;
    }

    if (userMessage === '/help') {
      // 도움말 표시 (간단히)
      return;
    }

    // LLM 호출
    setIsProcessing(true);
    setCurrentResponse('');
    setCurrentThinking('');

    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMessage },
    ];
    setMessages(newMessages);

    try {
      // 스트리밍 응답
      let fullText = '';
      let thinkingContent = '';
      let responseContent = '';

      for await (const chunk of llmClient.chatCompletionStream({
        messages: newMessages,
      })) {
        // chunk에서 실제 content 추출
        const content = chunk.choices[0]?.delta?.content;
        if (!content) continue;

        fullText += content;

        // <think> 또는 <thinking> 태그 파싱
        const thinkOpenRegex = /<think(?:ing)?>/g;
        const thinkCloseRegex = /<\/think(?:ing)?>/g;

        // Thinking 태그 처리
        let currentText = fullText;
        const thinkOpenMatch = currentText.match(thinkOpenRegex);
        const thinkCloseMatch = currentText.match(thinkCloseRegex);

        if (thinkOpenMatch && !thinkCloseMatch) {
          // Thinking 시작, 아직 끝나지 않음
          const parts = currentText.split(thinkOpenRegex);
          thinkingContent = parts[1] || '';
          responseContent = parts[0] || '';
          setCurrentThinking(thinkingContent);
          setCurrentResponse(responseContent);
        } else if (thinkOpenMatch && thinkCloseMatch) {
          // Thinking 완료
          const thinkStartIdx = currentText.search(thinkOpenRegex);
          const thinkEndIdx = currentText.search(thinkCloseRegex);

          if (thinkStartIdx !== -1 && thinkEndIdx !== -1) {
            const beforeThink = currentText.substring(0, thinkStartIdx);
            const thinkContent = currentText.substring(
              thinkStartIdx + currentText.match(thinkOpenRegex)![0].length,
              thinkEndIdx
            );
            const afterThink = currentText.substring(
              thinkEndIdx + currentText.match(thinkCloseRegex)![0].length
            );

            thinkingContent = thinkContent;
            responseContent = beforeThink + afterThink;
            setCurrentThinking(''); // Thinking 완료, 숨김
            setCurrentResponse(responseContent);
          }
        } else {
          // Thinking 태그 없음, 일반 응답
          responseContent = currentText;
          setCurrentResponse(responseContent);
        }
      }

      // 최종 응답 저장 (thinking 태그 제거된 버전)
      setMessages([
        ...newMessages,
        { role: 'assistant', content: responseContent || fullText },
      ]);
      setCurrentResponse('');
      setCurrentThinking('');
    } catch (error) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Error: ' + (error instanceof Error ? error.message : 'Unknown error'),
        },
      ]);
      setCurrentThinking('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="double" borderColor="cyan" paddingX={2} marginBottom={1}>
        <Box flexDirection="column">
          <Text bold color="cyan">
            OPEN-CLI Interactive Mode (Ink UI)
          </Text>
          <Text dimColor>
            Model: {modelInfo.model} | Endpoint: {modelInfo.endpoint}
          </Text>
          <Text dimColor>
            Commands: /exit /clear /help | Ctrl+C to quit
          </Text>
        </Box>
      </Box>

      {/* Message History */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, index) => (
          <Box key={index} marginBottom={1}>
            <Box marginRight={1}>
              <Text bold color={msg.role === 'user' ? 'green' : 'blue'}>
                {msg.role === 'user' ? '🧑 You:' : '🤖 Assistant:'}
              </Text>
            </Box>
            <Text>{msg.content}</Text>
          </Box>
        ))}

        {/* Current thinking (if any) */}
        {isProcessing && currentThinking && (
          <Box marginBottom={1}>
            <Box marginRight={1}>
              <Text bold color="magenta">
                💭 Thinking:
              </Text>
            </Box>
            <Text dimColor>{currentThinking}</Text>
          </Box>
        )}

        {/* Current streaming response */}
        {isProcessing && currentResponse && (
          <Box marginBottom={1}>
            <Box marginRight={1}>
              <Text bold color="blue">
                🤖 Assistant:
              </Text>
            </Box>
            <Text>{currentResponse}</Text>
          </Box>
        )}
      </Box>

      {/* Input Box */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        {isProcessing ? (
          <Box>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text dimColor> Processing...</Text>
          </Box>
        ) : (
          <Box>
            <Text bold color="green">
              You:{' '}
            </Text>
            <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
          </Box>
        )}
      </Box>
    </Box>
  );
};
