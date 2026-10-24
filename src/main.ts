import { ComponentRegistry } from 'mailspring-exports';
import { SuggestionBannerContainer } from './suggestion-banner';

export function activate() {
  ComponentRegistry.register(SuggestionBannerContainer, { role: 'message:BodyHeader' });
}

export function deactivate() {
  ComponentRegistry.unregister(SuggestionBannerContainer);
}

export function serialize() {}
