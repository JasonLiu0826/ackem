package demo_java;

public class Sort {


    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j+1]) {
                    int t = arr[j];
                    arr[j] = arr[j+1];
                    arr[j+1] = t;
                }
            }
        }
    }

    public static void selectSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n; i++) {
            int minIdx = i;
            for (int j = i + 1; j < n; j++) {
                if (arr[j] < arr[minIdx])
                    minIdx = j;
            }
            int t = arr[i];
            arr[i] = arr[minIdx];
            arr[minIdx] = t;
        }
    }

    public static void main(String[] args) {
        int[] nums = {5, 2, 9, 1, 5, 6};
        int[] nums1 = {9,5,70,6,15,4,5};

        bubbleSort(nums);
        selectSort(nums1);
        for (int x : nums) System.out.print(x + " ");
        System.out.print("\n");
        for (int x : nums1) System.out.print(x + " ");

        
    }
    
}
