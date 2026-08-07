import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { useCreateSupportTicket } from '@workspace/api-client-react';

interface SupportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportModal({ open, onOpenChange }: SupportModalProps) {
  const [message, setMessage] = useState('');
  const { toast } = useToast();
  const createTicket = useCreateSupportTicket();

  const handleSubmit = () => {
    if (message.trim().length < 10) {
      toast({
        title: 'Please add a little more detail.',
        description: 'Describe your issue in at least ten characters.',
      });
      return;
    }

    createTicket.mutate(
      { data: { message: message.trim() } },
      {
        onSuccess: () => {
          toast({
            title: 'Ticket submitted',
            description: "We've received your message and will respond shortly.",
          });
          setMessage('');
          onOpenChange(false);
        },
        onError: () => {
          toast({
            title: "We couldn't complete your request.",
            description: 'Please try again in a few moments.',
          });
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-card border-border">
        <SheetHeader className="mb-6">
          <SheetTitle className="sl-page-subheading">
            Contact Studio Support
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Our team typically responds within 24 hours.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Tickets route to{' '}
            <span className="text-foreground">info@studiolayerai.com</span>
          </p>
        </SheetHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Describe your workspace issue or feature request
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's happening or what you'd like to see..."
              className="min-h-[160px] resize-none bg-background border-border text-foreground"
            />
            <p className="text-xs text-muted-foreground font-mono">
              {message.length} characters
            </p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={createTicket.isPending || message.trim().length < 10}
            className="w-full"
          >
            {createTicket.isPending ? 'Submitting...' : 'Submit Ticket'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
