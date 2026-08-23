export type ActionPlan = {
  actionType: 'stop_instance' | 'detach_volume' | 'delete_volume' | 'resize_instance' | 'stop_load_balancer';
  isReversible: boolean;
  manualReview?: string;
};

export type ActionPlanInput = { findingType: string };

export const AUTO_APPROVE_REVERSIBLE_ACTIONS = ['delete_volume', 'stop_load_balancer', 'resize_instance'] as const;
export function isActionReversible(actionType: string): boolean {
  return AUTO_APPROVE_REVERSIBLE_ACTIONS.includes(actionType as typeof AUTO_APPROVE_REVERSIBLE_ACTIONS[number]);
}

export function actionPlanForFinding(record: ActionPlanInput, providerSupportsStoppedLoadBalancer = true): ActionPlan {
  if (record.findingType === 'unattached_volume') {
    return { actionType: 'delete_volume', isReversible: isActionReversible('delete_volume') };
  }
  if (record.findingType === 'idle_load_balancer') {
    return providerSupportsStoppedLoadBalancer
      ? { actionType: 'stop_load_balancer', isReversible: isActionReversible('stop_load_balancer') }
      : { actionType: 'stop_load_balancer', isReversible: isActionReversible('stop_load_balancer'), manualReview: 'Provider does not support a stopped load-balancer state; manual review required instead of deletion.' };
  }
  if (record.findingType === 'underutilized_rds') {
    return { actionType: 'resize_instance', isReversible: isActionReversible('resize_instance') };
  }
  throw new Error(`Unsupported waste finding type: ${record.findingType}`);
}
