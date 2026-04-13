import React from 'react';
import { View, ScrollView, TouchableOpacity, Linking } from 'react-native';
import Header from '@/components/Header';
import ThemedText from '@/components/ThemedText';
import Expandable from '@/components/Expandable';
import Section from '@/components/layout/Section';
import Icon from '@/components/Icon';
import { Button } from '@/components/Button';
import AnimatedView from '@/components/AnimatedView';

// FAQ data
const faqData = [
  {
    id: '1',
    question: 'How do I start a conversation with Luna?',
    answer: 'Starting a conversation with Luna is easy. Simply tap on the mic icon to start voice input, or use the text input at the bottom of the screen to type your message. Luna will respond instantly to your queries.'
  },
  {
    id: '2',
    question: 'What can Luna help me with?',
    answer: 'Luna can assist with a wide range of tasks including answering questions, providing information, generating content, suggesting ideas, translating text, explaining concepts, and having natural conversations. Just ask, and Luna will try to help!'
  },
  {
    id: '3',
    question: 'Does Luna remember our previous conversations?',
    answer: 'Yes, Luna maintains context within the same session, so you can refer back to information from earlier in your conversation. For privacy reasons, conversations aren\'t stored permanently unless you explicitly save them.'
  },
  {
    id: '4',
    question: 'How accurate is Luna\'s information?',
    answer: 'Luna strives to provide accurate and helpful information. However, it\'s trained on data with a cutoff date and may not have information about very recent events. Always verify critical information from official sources.'
  },
  {
    id: '5',
    question: 'Can I change Luna\'s voice or personality?',
    answer: 'Yes! You can customize Luna\'s voice by going to Settings > AI Voice and selecting from the available options. Each voice has a unique tone and style to match your preferences.'
  },
  {
    id: '6',
    question: 'Is my conversation with Luna private?',
    answer: 'Your privacy is important to us. Conversations with Luna are encrypted and not shared with third parties. We only store conversations temporarily to improve our service, and you can delete your conversation history at any time from Settings.'
  }
];

// Contact information
const contactInfo = [
  {
    id: 'email',
    type: 'Email',
    value: 'support@luna-ai.com',
    icon: 'Mail' as const,
    action: () => Linking.openURL('mailto:support@luna-ai.com')
  },
  {
    id: 'phone',
    type: 'Phone',
    value: '+1 (800) 123-LUNA',
    icon: 'Phone' as const,
    action: () => Linking.openURL('tel:+18001235862')
  },
  {
    id: 'hours',
    type: 'Support Hours',
    value: '24/7 AI Support Available',
    icon: 'Clock' as const,
    action: undefined
  }
];

export default function HelpScreen() {
  return (
    <View className="flex-1 bg-background">
      <Header title="Help & Support" showBackButton />
      
      <ScrollView showsVerticalScrollIndicator={false}>
        <AnimatedView animation="fadeIn" duration={400}>
          {/* FAQ Section */}
          <Section 
            title="Frequently Asked Questions" 
            titleSize="xl" 
            className="px-global pt-6 pb-2"
          />
          
          <View className="px-global">
            {faqData.map((faq) => (
              <Expandable 
                key={faq.id}
                title={faq.question}
                className="py-1"
              >
                <ThemedText className="text-text leading-6">
                  {faq.answer}
                </ThemedText>
              </Expandable>
            ))}
          </View>
          

          
          {/* Contact Section */}
          <Section 
            title="Contact Us" 
            titleSize="xl" 
            className="px-global pb-2 mt-14"
            subtitle="We're here to help with any questions or concerns"
          />
          
          <View className="px-global pb-8">
            {contactInfo.map((contact) => (
              <TouchableOpacity 
                key={contact.id}
                onPress={contact.action}
                disabled={!contact.action}
                className="flex-row items-center py-4 border-b border-border"
              >
                <View className="w-10 h-10 rounded-full bg-secondary items-center justify-center mr-4">
                  <Icon name={contact.icon} size={20} />
                </View>
                <View>
                  <ThemedText className="text-sm text-subtext">
                    {contact.type}
                  </ThemedText>
                  <ThemedText className="font-medium">
                    {contact.value}
                  </ThemedText>
                </View>
                {contact.action && (
                  <Icon name="ChevronRight" size={20} className="ml-auto text-subtext" />
                )}
              </TouchableOpacity>
            ))}
            
            <Button 
              title="Email Us" 
              iconStart="Mail"
              className="mt-8"
              onPress={() => Linking.openURL('mailto:support@luna-ai.com')}
            />
          </View>
        </AnimatedView>
      </ScrollView>
    </View>
  );
}
