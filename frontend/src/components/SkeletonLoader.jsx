import { memo } from 'react';
import Skeleton from './ui/Skeleton';

function SkeletonLoader(props) {
  return <Skeleton {...props} />;
}

export default memo(SkeletonLoader);
