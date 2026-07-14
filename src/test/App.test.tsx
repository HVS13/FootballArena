import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { expect, test } from 'vitest';
import App from '../App';

test('renders app header', () => {
  render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  );

  expect(screen.getByRole('heading', { name: 'Football Arena' })).toBeTruthy();
});
