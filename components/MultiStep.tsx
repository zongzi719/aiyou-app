import React, { ReactNode, useState, useRef, useEffect, Children, isValidElement, cloneElement } from 'react';
import { View, Pressable, ScrollView, Animated, BackHandler, NativeEventSubscription } from 'react-native';
import Header from '@/components/Header';
import { Button } from '@/components/Button';
import ThemedText from '@/components/ThemedText';
import Icon from '@/components/Icon';
import { router } from 'expo-router';
import BackHandlerManager from '@/utils/BackHandlerManager';

// Step component that will be used as children
export interface StepProps {
  title: string;
  optional?: boolean;
  children: ReactNode;
}

export const Step: React.FC<StepProps> = ({ children }) => {
  return <>{children}</>; // Just render children, this is mainly for type safety
};

// Add this to help with type checking
const isStepComponent = (child: any): child is React.ReactElement<StepProps> => {
  return isValidElement(child) && (child.type === Step || (typeof child.type === 'function' && child.type.name === 'Step'));
};

interface StepData {
  key: string;
  title: string;
  optional?: boolean;
  component: ReactNode;
}

interface MultiStepProps {
  children: ReactNode;
  onComplete: () => void;
  onClose?: () => void;
  showHeader?: boolean;
  showStepIndicator?: boolean;
  className?: string;
  onStepChange?: (nextStep: number) => boolean;
}

export default function MultiStep({
  children,
  onComplete,
  onClose,
  showHeader = true,
  showStepIndicator = true,
  className = '',
  onStepChange,
}: MultiStepProps) {
  // Filter and validate children to only include Step components
  const validChildren = Children.toArray(children)
    .filter(isStepComponent);

  // Extract step data from children
  const steps: StepData[] = validChildren.map((child, index) => {
    const { title, optional, children: stepContent } = (child as React.ReactElement<StepProps>).props;
    return {
      key: `step-${index}`,
      title: title || `Step ${index + 1}`,
      optional,
      component: stepContent
    };
  });

  // Ensure we have at least one step
  if (steps.length === 0) {
    steps.push({
      key: 'empty-step',
      title: 'Empty',
      component: <View><ThemedText>No steps provided</ThemedText></View>
    });
  }

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;

  // Store a reference to the handler ID for reliable cleanup
  const handlerIdRef = useRef<string | null>(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const progressAnims = useRef(steps.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Reset and start fade/slide animations
    fadeAnim.setValue(0);
    slideAnim.setValue(50);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start();

    // Animate progress indicators
    steps.forEach((_, index) => {
      Animated.timing(progressAnims[index], {
        toValue: index <= currentStepIndex ? 1 : 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    });
  }, [currentStepIndex]);

  // Access the back handler manager
  const backManager = BackHandlerManager.getInstance();

  // Clean up function to ensure handlers are properly removed
  const cleanupBackHandler = () => {
    // Remove the handler if it exists
    if (handlerIdRef.current) {
      console.log(`MultiStep: Cleaning up back handler with ID: ${handlerIdRef.current}`);
      backManager.unregisterHandler(handlerIdRef.current);
      handlerIdRef.current = null;
    }
  };

  // Add back button handler using our manager
  useEffect(() => {
    // Clean up any existing handler first
    cleanupBackHandler();

    // Create a unique ID for this component instance
    const handlerId = `multi-step-${Date.now()}`;
    handlerIdRef.current = handlerId;

    // This effect handles both hardware back button presses and ensures proper cleanup
    const handleBackPress = () => {
      if (!isFirstStep) {
        handleBack();
        return true; // Prevent default behavior
      }
      // If we're on first step and have onClose, use it
      if (isFirstStep && onClose) {
        onClose();
        return true; // Prevent default behavior
      }
      return false; // Let the system handle it
    };

    // Register the handler with our manager
    console.log(`MultiStep: Registering back handler with ID: ${handlerId}`);
    backManager.registerHandler(handlerId, handleBackPress);

    // Make this the active handler
    backManager.setActiveHandler(handlerId);

    // Return cleanup function
    return cleanupBackHandler;
  }, [currentStepIndex, isFirstStep, onClose]);

  // Add an extra cleanup effect that runs only on unmount
  useEffect(() => {
    return () => {
      console.log('MultiStep: Component unmounting, performing final cleanup');
      cleanupBackHandler();

      // For absolute safety, reset all handlers in the manager on unmount
      // This helps when transitioning between screens
      backManager.resetAll();
    };
  }, []);

  const handleNext = () => {
    if (isLastStep) {
      // Make sure to clean up back handlers before completing
      cleanupBackHandler();
      onComplete();
    } else {
      const nextStep = currentStepIndex + 1;
      const canProceed = onStepChange ? onStepChange(nextStep) : true;

      if (canProceed) {
        setCurrentStepIndex(nextStep);
      }
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleSkip = () => {
    if (currentStep.optional && !isLastStep) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  return (
    <View className={`flex-1 bg-background ${className}`}>
      {showHeader && (
        <Header
          rightComponents={[
            onClose ? (
              <Pressable
                key="close"
                onPress={onClose}
                className="p-2 rounded-full active:bg-secondary"
                hitSlop={8}
              >
                <Icon
                  name="X"
                  size={24}
                  className="text-text"
                />
              </Pressable>
            ) : undefined
          ]}
          leftComponent={[
            currentStep.optional && !isLastStep && (
              <Button
                key="skip"
                title="Skip"
                variant="ghost"
                onPress={handleSkip}
                size="small"
              />
            ),
            !isFirstStep && (
              <Icon
                name="ArrowLeft"
                key="back"
                size={24}
                className="text-text"
                onPress={handleBack}
              />
            ),

          ].filter(Boolean)}
        />
      )}

      {showStepIndicator && (
        <View className="flex-row justify-center items-center py-2 px-4 w-full rounded-full overflow-hidden">
          <View className='rounded-full flex-row w-full overflow-hidden'>
            {steps.map((step, index) => (
              <React.Fragment key={step.key}>
                <View className="flex items-center flex-1 mx-px">
                  <View className='h-1 w-full bg-secondary'>
                    <Animated.View
                      className="h-1 bg-primary absolute top-0 left-0"
                      style={{
                        width: progressAnims[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%']
                        })
                      }}
                    />
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      <View className="flex-1">
        <Animated.View
          className="flex-1"
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }}>
          {currentStep.component}
        </Animated.View>
      </View>
      <View className='flex-row justify-center items-center px-4'>

        <Button
          key="next"
          title={isLastStep ? 'Complete' : 'Next'}
          onPress={handleNext}
          size="large"
          className='w-full bg-highlight'
          rounded="full"
          textClassName='text-white'
        />
      </View>
    </View>
  );
} 