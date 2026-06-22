import React, {useState, useRef, useEffect, useCallback} from "react";
import styles from './ModalPanel.scss';
import PanelCloseButton from "~/app/ui/components/PanelCloseButton";

const ModalPanel: React.FC<{
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}> = (
	{
		title,
		onClose,
		children
	}
) => {
	const [position, setPosition] = useState<{x: number; y: number}>(() => {
		const saved = localStorage.getItem(`streetsGL-modal-${title}-position`);
		if (saved) {
			try {
				return JSON.parse(saved);
			} catch {
				return {x: window.innerWidth - 616, y: 96}; // Default: top right
			}
		}
		return {x: window.innerWidth - 616, y: 96}; // Default: top right (600px width + 16px margin)
	});
	const [isDragging, setIsDragging] = useState(false);
	const dragStartRef = useRef<{x: number; y: number} | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Save position to localStorage
	useEffect(() => {
		localStorage.setItem(`streetsGL-modal-${title}-position`, JSON.stringify(position));
	}, [position, title]);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		// Only start dragging if clicking on the header, not on buttons or content
		const target = e.target as HTMLElement;
		
		// Check if clicking on button or close button
		if (target.closest('button') || target.closest('[class*="modal__close"]')) {
			return;
		}
		
		// Check if clicking on modal body (use classList.contains to avoid selector issues)
		const bodyElement = target.closest('[class*="modal__body"]');
		if (bodyElement) {
			return;
		}
		
		// Only drag from header area or modal container
		const headerElement = target.closest('[class*="modal__header"]');
		const modalElement = target.closest('[class*="modal"]');
		if (headerElement || (modalElement && target.classList.contains(styles.modal))) {
			setIsDragging(true);
			dragStartRef.current = {
				x: e.clientX - position.x,
				y: e.clientY - position.y
			};
			e.preventDefault();
		}
		return; // Explicit return for TypeScript
	}, [position, styles]);

	const handleMouseMove = useCallback((e: MouseEvent) => {
		if (!isDragging || !dragStartRef.current) return;
		
		const newX = e.clientX - dragStartRef.current.x;
		const newY = e.clientY - dragStartRef.current.y;
		
		// Constrain to viewport
		const modalWidth = 600;
		const modalHeight = containerRef.current?.offsetHeight || 400;
		const constrainedX = Math.max(0, Math.min(window.innerWidth - modalWidth, newX));
		const constrainedY = Math.max(0, Math.min(window.innerHeight - modalHeight, newY));
		
		setPosition({x: constrainedX, y: constrainedY});
	}, [isDragging]);

	const handleMouseUp = useCallback(() => {
		setIsDragging(false);
		dragStartRef.current = null;
	}, []);

	useEffect(() => {
		if (isDragging) {
			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);
			return () => {
				window.removeEventListener('mousemove', handleMouseMove);
				window.removeEventListener('mouseup', handleMouseUp);
			};
		}
		return undefined; // Explicit return for TypeScript when not dragging
	}, [isDragging, handleMouseMove, handleMouseUp]);

	return (
		<div 
			ref={containerRef}
			className={styles.modal}
			style={{
				left: `${position.x}px`,
				top: `${position.y}px`,
				right: 'auto',
				cursor: isDragging ? 'grabbing' : 'default'
			}}
			onMouseDown={handleMouseDown}
		>
			<div className={styles.modal__close}>
				<PanelCloseButton onClick={onClose}/>
			</div>
			<div className={styles.modal__header}>{title}</div>
			<div className={styles.modal__body}>{children}</div>
		</div>
	);
}

export default React.memo(ModalPanel);