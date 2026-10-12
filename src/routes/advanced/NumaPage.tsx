import { motion } from "framer-motion";
import { pageEnter } from "@/lib/motion";
import NumaOS from "@/features/numa/NumaOS";

/**
 * /numa — the Numa OS surface. The conversational money experience lives in
 * `src/features/numa/`; this route file stays a thin shell so the lazy-route
 * contract and the advanced-mode gate never change.
 */
export default function NumaPage() {
  return (
    <motion.div {...pageEnter}>
      <NumaOS />
    </motion.div>
  );
}
